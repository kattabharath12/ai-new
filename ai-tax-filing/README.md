# AI Tax Filing Website

A complete tax filing platform with document upload, OCR processing, form generation, and payment integration.

## Features

- **User Authentication**: Secure signup and login system
- **Tax Information Collection**: Filing status, dependents, address information
- **Document Upload**: W-2 form upload with OCR text extraction
- **Form Generation**: Automatic 1098 form generation based on uploaded documents
- **Payment Processing**: Stripe integration for secure payments
- **Form Submission**: Final tax return submission workflow

## Tech Stack

- **Backend**: Node.js, Express.js, MongoDB, Mongoose
- **Frontend**: Vanilla JavaScript, Tailwind CSS
- **Authentication**: JWT tokens with bcrypt password hashing
- **File Processing**: Multer for uploads, Tesseract.js for OCR
- **Payments**: Stripe payment processing
- **Security**: Helmet, CORS, rate limiting, input validation

## Quick Deploy to Railway

1. **Clone and prepare the project:**
   ```bash
   git clone <your-repo-url>
   cd ai-tax-filing
   ```

2. **Set up environment variables in Railway:**
   - `MONGODB_URI`: Your MongoDB connection string
   - `JWT_SECRET`: A secure random string for JWT signing
   - `STRIPE_SECRET_KEY`: Your Stripe secret key
   - `PORT`: Will be set automatically by Railway

3. **Deploy to Railway:**
   - Connect your GitHub repository to Railway
   - Railway will automatically detect the Node.js project
   - The `railway.toml` file configures the deployment

## Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

3. **Start MongoDB:**
   - Install and run MongoDB locally, or use MongoDB Atlas

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Access the application:**
   - Open http://localhost:3000 in your browser

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_URI` | MongoDB connection string | Yes |
| `JWT_SECRET` | Secret key for JWT token signing | Yes |
| `STRIPE_SECRET_KEY` | Stripe secret key for payments | Yes |
| `PORT` | Server port (default: 3000) | No |
| `NODE_ENV` | Environment (development/production) | No |

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Tax Information
- `PUT /api/tax/info` - Update tax information
- `GET /api/tax/info` - Get tax information
- `POST /api/tax/generate-1098` - Generate 1098 form
- `PUT /api/tax/update-1098` - Update 1098 form
- `GET /api/tax/form-1098` - Get 1098 form
- `POST /api/tax/submit` - Submit tax return

### File Upload
- `POST /api/upload/w2` - Upload W-2 document
- `GET /api/upload/documents` - Get uploaded documents
- `DELETE /api/upload/documents/:docId` - Delete document

### Payments
- `POST /api/payment/create-intent` - Create payment intent
- `POST /api/payment/confirm` - Confirm payment
- `GET /api/payment/history` - Get payment history

## Security Features

- **Password Hashing**: Bcrypt with salt rounds
- **JWT Authentication**: Secure token-based authentication
- **Input Validation**: Express-validator for request validation
- **Rate Limiting**: Prevents abuse and DDoS attacks
- **CORS Protection**: Configurable cross-origin requests
- **Helmet**: Security headers middleware
- **File Upload Security**: File type and size restrictions

## File Structure

```
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── .env.example          # Environment variables template
├── railway.toml          # Railway deployment configuration
├── Dockerfile            # Docker container configuration
├── models/
│   └── User.js          # User database model
├── routes/
│   ├── auth.js          # Authentication routes
│   ├── tax.js           # Tax-related routes
│   ├── upload.js        # File upload routes
│   └── payment.js       # Payment processing routes
├── middleware/
│   └── auth.js          # JWT authentication middleware
└── public/
    ├── index.html       # Frontend application
    └── script.js        # Frontend JavaScript
```

## Usage Workflow

1. **Sign Up/Login**: Users create an account or login
2. **Tax Information**: Enter filing status, dependents, and address
3. **Upload W-2**: Upload W-2 documents for OCR processing
4. **Review Form**: Generated 1098 form is displayed for review/editing
5. **Payment**: Secure payment processing via Stripe
6. **Submit**: Final submission of tax return

## Deployment Notes

- **Railway**: Automatically detects Node.js and deploys
- **MongoDB**: Use MongoDB Atlas for production database
- **Stripe**: Ensure you're using production keys for live deployment
- **Environment**: Set `NODE_ENV=production` for production builds
- **Security**: Review and update JWT secrets and other sensitive configurations

## Development Tips

- Use test Stripe keys during development
- Set up MongoDB locally or use a development database
- Enable CORS for your development domain if testing from different ports
- Check Railway logs for any deployment issues

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.