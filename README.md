# Backend Express Server

A minimal Express server with CORS enabled, a POST route for creating orders, and Cashfree payment integration.

## Setup

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Start production server
npm start
```

## API Endpoints

### Health Check
- **URL**: `/api/health`
- **Method**: `GET`
- **Response**: 
  ```json
  {
    "status": "ok",
    "message": "Server is running"
  }
  ```

### Create Order
- **URL**: `/api/create-order`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "amount": 1000,
    "customerId": "cust123",
    "productId": "prod456" // Optional
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "message": "Order created successfully",
    "data": {
      "orderId": "ORD-1623456789",
      "amount": 1000,
      "customerId": "cust123",
      "productId": "prod456",
      "status": "created",
      "createdAt": "2023-06-12T10:30:00.000Z",
      "paymentSession": {
        "payment_session_id": "sess_1623456789",
        "order_id": "ORD-1623456789",
        "order_amount": 1000,
        "order_currency": "INR"
      }
    }
  }
  ```

### Payment Configuration
- **URL**: `/api/payment-config`
- **Method**: `GET`
- **Response**:
  ```json
  {
    "sdkUrl": "https://sdk.cashfree.com/js/v3/cashfree.js",
    "environment": "production"
  }
  ```

## Cashfree Integration

This server includes basic support for Cashfree payment integration. The demo implementation:

1. Creates an order with a unique ID
2. Generates a mock payment session ID
3. Returns these details to the client

### Client-Side Integration

A demo HTML page (`payment-demo.html`) is included that shows how to:

1. Load the Cashfree SDK dynamically
2. Initialize it in production mode
3. Create an order via the API
4. Prepare for rendering the payment component

In a production environment, you would need to:

1. Register with Cashfree and obtain API keys
2. Make server-to-server calls to create actual payment sessions
3. Handle webhooks for payment notifications

## Deployment

This server is configured for easy deployment on Vercel using the included `vercel.json` file.

To deploy:

1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` from the project directory
3. Follow the prompts to deploy 