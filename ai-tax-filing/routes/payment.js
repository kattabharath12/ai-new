const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User'); // Direct import, no destructuring
const auth = require('../middleware/auth');

const router = express.Router();

// Create payment intent
router.post('/create-intent', auth, async (req, res) => {
  try {
    const { amount } = req.body; // Amount in cents
    
    if (!amount || amount < 50) { // Minimum $0.50
      return res.status(400).json({ message: 'Invalid amount' });
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'usd',
      metadata: {
        userId: user.id.toString(),
        service: 'tax-filing'
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('Create payment intent error:', error);
    res.status(500).json({ message: 'Payment error', error: error.message });
  }
});

// Confirm payment
router.post('/confirm', auth, async (req, res) => {
  try {
    const { paymentIntentId, amount } = req.body;

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status === 'succeeded') {
      // Create payment record
      const paymentRecord = {
        amount: amount / 100, // Convert from cents to dollars
        stripePaymentId: paymentIntentId,
        status: 'completed',
        date: new Date()
      };

      // Add to user's payments array
      const currentPayments = user.payments || [];
      currentPayments.push(paymentRecord);

      await user.update({ payments: currentPayments });

      res.json({ 
        message: 'Payment confirmed successfully',
        paymentStatus: 'completed'
      });
    } else {
      res.status(400).json({ 
        message: 'Payment not completed',
        paymentStatus: paymentIntent.status
      });
    }
  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(500).json({ message: 'Payment confirmation error', error: error.message });
  }
});

// Get payment history
router.get('/history', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, {
      attributes: ['payments']
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.payments || []);
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
