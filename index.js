import express from 'express';
import cors from 'cors';
import { Cashfree, CFEnvironment } from 'cashfree-pg';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Cashfree credentials (for demo, use env vars in production)
const CF_APP_ID = process.env.CF_APP_ID || "850529145692c9f93773ed2c0a925058";
const CF_SECRET_KEY = process.env.CF_SECRET_KEY || "cfsk_ma_prod_ab58890e7f7e53525e9d364fc6effe88_ab702d01";

const cashfree = new Cashfree(CFEnvironment.PRODUCTION, CF_APP_ID, CF_SECRET_KEY);

// Supabase client initialization
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-supabase-url.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'your-supabase-anon-key';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Clerk API
const CLERK_API_URL = "https://api.clerk.dev/v1/me";

// Middleware
// Configure CORS to allow requests from frontend
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:8080', 
      'http://localhost:3000', 
      'http://localhost:5173', 
      'http://localhost:3001',
      'http://192.168.1.2:8080'
    ];
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, origin);
    } else {
      console.log('Origin not allowed by CORS:', origin);
      return callback(null, allowedOrigins[0]); // Default to first allowed origin
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Helper to get user info from Clerk
async function getClerkUserInfo(token) {
  try {
    const response = await axios.get(CLERK_API_URL, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch user info from Clerk:', error);
    throw new Error('Failed to fetch user info from Clerk');
  }
}

// Helper function to store transaction in Supabase
async function storeTransactionInSupabase(transactionData) {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .insert([
        {
          user_id: transactionData.userId,
          order_id: transactionData.orderId,
          amount: transactionData.amount,
          metal_type: transactionData.metalType,
          status: 'pending', // Initial status is pending
          payment_method: 'UPI',
          created_at: new Date().toISOString()
        }
      ]);

    if (error) {
      console.error('Error storing transaction in Supabase:', error);
      return { success: false, error };
    }

    console.log('Transaction stored in Supabase:', data);
    return { success: true, data };
  } catch (error) {
    console.error('Exception storing transaction in Supabase:', error);
    return { success: false, error };
  }
}

// Routes
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

app.post('/api/create-order', async (req, res) => {
  try {
    console.log('Received create-order request:', req.body);
    const { amount, metal, userData } = req.body;
    if (!amount || !metal) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: amount and metal'
      });
    }
    
    // User data can come from either Clerk API or frontend fallback
    let user;
    
    // Get Clerk session token from Authorization header
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', ''); 

  //demo by dev
    
    if (token) {
      console.log('Fetching user info from Clerk...');
      try {
        // Fetch user info from Clerk
        user = await getClerkUserInfo(token);
        console.log('Clerk user info received:', JSON.stringify(user, null, 2));
      } catch (clerkError) {
        console.error('Error fetching user from Clerk:', clerkError);
        
        // If userData was provided as fallback, use it
        if (userData) {
          console.log('Using provided userData fallback');
          user = {
            id: userData.customerId,
            first_name: userData.customerName?.split(' ')[0] || 'Guest',
            last_name: userData.customerName?.split(' ')[1] || '',
            email_addresses: [{ email_address: userData.customerEmail }],
            phone_numbers: [{ phone_number: userData.customerPhone }]
          };
        } else {
          // No token and no userData, use default guest
          console.log('Using default guest user');
          user = {
            id: "guest_user",
            first_name: "Guest",
            last_name: "User",
            email_addresses: [{ email_address: "guest@example.com" }],
            phone_numbers: [{ phone_number: "9999999999" }]
          };
        }
      }
    } else if (userData) {
      // No token but userData was provided
      console.log('No token provided, using userData:', userData);
      user = {
        id: userData.customerId,
        first_name: userData.customerName?.split(' ')[0] || 'Guest',
        last_name: userData.customerName?.split(' ')[1] || '',
        email_addresses: [{ email_address: userData.customerEmail }],
        phone_numbers: [{ phone_number: userData.customerPhone }]
      };
    } else {
      // No token and no userData, use default guest
      console.log('No token or userData, using default guest user');
      user = {
        id: "guest_user",
        first_name: "Guest",
        last_name: "User",
        email_addresses: [{ email_address: "guest@example.com" }],
        phone_numbers: [{ phone_number: "9999999999" }]
      };
    }
    
    // Use Clerk user info for Cashfree order
    const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const request = {
      order_amount: parseFloat(amount),
      order_currency: "INR",
      order_id: orderId,
      customer_details: {
        customer_id: user.id || "clerk_user",
        customer_name: user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user.username || "User",
        customer_email: user.email_addresses?.[0]?.email_address || "demo@example.com",
        customer_phone: user.phone_numbers?.[0]?.phone_number?.replace('+91', '') || "9999999999"
      },
      order_meta: {
        return_url: "https://www.cashfree.com/devstudio/preview/pg/web/checkout?order_id={order_id}",
        notes: { metal }
      }
    };
    
    console.log('Sending order request to Cashfree:', JSON.stringify(request, null, 2));
    // Create order with Cashfree
    const response = await cashfree.PGCreateOrder(request);
    console.log('Cashfree order created successfully:', JSON.stringify(response.data, null, 2));
    
    // Generate direct UPI payment link
    const vpa = "aczentechnologiesp.cf@axisbank"; // Your UPI ID
    const upiPaymentLink = `upi://pay?pa=${vpa}&pn=AczenTech&am=${parseFloat(amount)}&tr=${orderId}&cu=INR`;
    
    // Store transaction in Supabase
    const transactionData = {
      userId: user.id,
      orderId: orderId,
      amount: parseFloat(amount),
      metalType: metal,
      paymentMethod: 'UPI'
    };
    
    await storeTransactionInSupabase(transactionData);
    
    // Get payment session ID from Cashfree response
    const paymentSessionId = response.data.payment_session_id || "";
    
    // Create simplified response with just the essential data
    const responseData = {
      order_id: orderId,
      amount: parseFloat(amount),
      currency: "INR",
      upi_link: upiPaymentLink,
      payment_session_id: paymentSessionId,
      status: "ACTIVE"
    };
    
    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: responseData
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error?.response?.data?.message || error.message || 'Unknown error'
    });
  }
});

// Add an endpoint to serve the Cashfree SDK initialization code
app.get('/api/payment-config', (req, res) => {
  res.status(200).json({
    sdkUrl: "https://sdk.cashfree.com/js/v3/cashfree.js",
    environment: "production"
  });
});

// Add a new endpoint to verify payment status
app.get('/api/verify-payment/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }
    
    console.log(`Verifying payment status for order: ${orderId}`);
    
    try {
      // Fetch payment details from Cashfree
      const response = await cashfree.PGOrderFetchPayments(orderId);
      console.log('Payment details fetched:', JSON.stringify(response.data, null, 2));
      
      // Process the payment data
      const transactions = response.data || [];
      let paymentStatus = "FAILURE"; // Default status
      
      // Check for SUCCESS transactions first
      if (transactions.filter(transaction => transaction.payment_status === "SUCCESS").length > 0) {
        paymentStatus = "SUCCESS";
        
        // Update transaction status in Supabase
        await supabase
          .from('transactions')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('order_id', orderId);
          
      } 
      // Then check for PENDING transactions
      else if (transactions.filter(transaction => transaction.payment_status === "PENDING").length > 0) {
        paymentStatus = "PENDING";
      } else {
        // Update transaction status in Supabase for failed payments
        await supabase
          .from('transactions')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('order_id', orderId);
      }
      
      // Return the payment status
      return res.status(200).json({
        success: true,
        orderId,
        status: paymentStatus,
        transactions: transactions
      });
      
    } catch (apiError) {
      console.error('Error fetching payment details from Cashfree:', apiError);
      
      // Return a failure status with appropriate message
      return res.status(500).json({
        success: false,
        message: 'Failed to verify payment status',
        error: apiError?.response?.data?.message || apiError.message,
        status: 'UNKNOWN'
      });
    }
  } catch (error) {
    console.error('Error in verify-payment endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error?.response?.data?.message || error.message
    });
  }
});

// Add a webhook endpoint for Cashfree to notify about payment status changes
app.post('/api/payment-webhook', async (req, res) => {
  try {
    const eventData = req.body;
    console.log('Received payment webhook:', JSON.stringify(eventData, null, 2));
    
    // Verify the webhook signature if Cashfree provides one
    // This would involve checking headers and validating the request
    
    // Process the event based on its type
    const orderId = eventData.data?.order?.order_id;
    const paymentStatus = eventData.data?.payment?.payment_status;
    
    if (orderId && paymentStatus) {
      console.log(`Payment status update for order ${orderId}: ${paymentStatus}`);
      
      // Update transaction status in Supabase
      let dbStatus = 'pending';
      if (paymentStatus === 'SUCCESS') {
        dbStatus = 'completed';
      } else if (paymentStatus === 'FAILED' || paymentStatus === 'CANCELLED') {
        dbStatus = 'failed';
      }
      
      const { data, error } = await supabase
        .from('transactions')
        .update({ 
          status: dbStatus, 
          updated_at: new Date().toISOString(),
          payment_id: eventData.data?.payment?.cf_payment_id || null
        })
        .eq('order_id', orderId);
        
      if (error) {
        console.error('Error updating transaction in Supabase:', error);
      } else {
        console.log('Transaction updated in Supabase:', data);
      }
      
      // Return success response
      return res.status(200).json({ success: true });
    } else {
      console.warn('Invalid webhook data received');
      return res.status(400).json({ success: false, message: 'Invalid webhook data' });
    }
  } catch (error) {
    console.error('Error processing payment webhook:', error);
    res.status(500).json({ success: false, message: 'Failed to process webhook' });
  }
});

// Add endpoint to fetch transaction history for a user
app.get('/api/transactions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    // Fetch transactions from Supabase
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('Error fetching transactions from Supabase:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch transactions',
        error: error.message
      });
    }
    
    return res.status(200).json({
      success: true,
      transactions: data
    });
  } catch (error) {
    console.error('Error in transactions endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: error.message || 'Unknown error'
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Catch-all error handler for async errors
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: err.message || 'Unknown error'
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 