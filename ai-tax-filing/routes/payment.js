// routes/payment.js - PostgreSQL Version
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Create payment intent
router.post('/create-intent', auth, async (req, res) => {
  try {
    const { amount } = req.body; // Amount in cents
    
    if (!amount || amount < 50) { // Minimum $0.50
      return res.status(400).json({ message: 'Invalid amount' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Create payment intent with Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'usd',
      metadata: {
        userId: user.id.toString(),
        service: 'tax-filing',
        userEmail: user.email
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('Payment intent error:', error);
    res.status(500).json({ message: 'Payment error', error: error.message });
  }
});

// Confirm payment
router.post('/confirm', auth, async (req, res) => {
  try {
    const { paymentIntentId, amount } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ message: 'Payment intent ID is required' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Retrieve payment intent from Stripe to verify status
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status === 'succeeded') {
      // Save payment record to PostgreSQL database
      const paymentData = {
        amount: amount / 100, // Convert from cents to dollars
        stripePaymentId: paymentIntentId,
        status: 'completed'
      };

      const savedPayment = await User.addPayment(req.userId, paymentData);

      res.json({ 
        message: 'Payment confirmed successfully',
        paymentStatus: 'completed',
        paymentId: savedPayment.id
      });
    } else {
      res.status(400).json({ 
        message: 'Payment not completed',
        paymentStatus: paymentIntent.status
      });
    }
  } catch (error) {
    console.error('Payment confirmation error:', error);
    res.status(500).json({ message: 'Payment confirmation error', error: error.message });
  }
});

// Get payment history for current user
router.get('/history', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.payments || []);
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get specific payment details
router.get('/:paymentId', auth, async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    // Get payment from database
    const payments = await User.getPaymentHistory(req.userId);
    const payment = payments.find(p => p.id.toString() === paymentId);
    
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // If payment has Stripe payment ID, get additional details from Stripe
    if (payment.stripe_payment_id) {
      try {
        const stripePayment = await stripe.paymentIntents.retrieve(payment.stripe_payment_id);
        
        res.json({
          ...payment,
          stripeDetails: {
            status: stripePayment.status,
            created: new Date(stripePayment.created * 1000),
            currency: stripePayment.currency,
            paymentMethod: stripePayment.payment_method_types
          }
        });
      } catch (stripeError) {
        // If Stripe lookup fails, just return database payment info
        console.warn('Failed to fetch Stripe details:', stripeError);
        res.json(payment);
      }
    } else {
      res.json(payment);
    }
  } catch (error) {
    console.error('Get payment details error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Refund payment (admin function - you might want to add admin auth)
router.post('/:paymentId/refund', auth, async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { amount, reason } = req.body; // Optional partial refund amount
    
    // Get payment from database
    const payments = await User.getPaymentHistory(req.userId);
    const payment = payments.find(p => p.id.toString() === paymentId);
    
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    if (!payment.stripe_payment_id) {
      return res.status(400).json({ message: 'No Stripe payment ID found' });
    }

    // Process refund with Stripe
    const refund = await stripe.refunds.create({
      payment_intent: payment.stripe_payment_id,
      amount: amount ? Math.round(amount * 100) : undefined, // Convert to cents if partial refund
      reason: reason || 'requested_by_customer'
    });

    // Update payment status in database (you might want to create a separate refunds table)
    // For now, we'll just return the refund info
    
    res.json({
      message: 'Refund processed successfully',
      refund: {
        id: refund.id,
        amount: refund.amount / 100, // Convert back to dollars
        status: refund.status,
        reason: refund.reason
      }
    });
  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({ message: 'Refund error', error: error.message });
  }
});

// Get payment statistics (optional - for dashboard)
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const payments = await User.getPaymentHistory(req.userId);
    
    const stats = {
      totalPayments: payments.length,
      totalAmount: payments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0),
      completedPayments: payments.filter(p => p.status === 'completed').length,
      pendingPayments: payments.filter(p => p.status === 'pending').length,
      lastPayment: payments.length > 0 ? payments[0] : null // Assuming payments are ordered by date desc
    };

    res.json(stats);
  } catch (error) {
    console.error('Payment stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Webhook endpoint for Stripe (optional - for handling async payment updates)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!endpointSecret) {
    console.warn('Stripe webhook secret not configured');
    return res.status(400).send('Webhook secret not configured');
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('Payment succeeded:', paymentIntent.id);
      
      // Update payment status in database if needed
      // This is useful for handling async payment confirmations
      
      break;
    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      console.log('Payment failed:', failedPayment.id);
      
      // Handle failed payment
      
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

module.exports = router;
