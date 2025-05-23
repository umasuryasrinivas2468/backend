import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

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
      'http://192.168.1.2:8080',
      'https://aczenfnl.vercel.app'
    ];
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, origin);
    } else {
      console.log('Origin not allowed by CORS:', origin);
      return callback(null, origin); // Allow the origin instead of defaulting to first allowed origin
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
          payment_method: transactionData.paymentMethod || 'CUSTOM',
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
    const { amount, metal, userData, paymentMethod } = req.body;
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
    
    // Generate order ID
    const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Store transaction in Supabase
    const transactionData = {
      userId: user.id,
      orderId: orderId,
      amount: parseFloat(amount),
      metalType: metal,
      paymentMethod: paymentMethod || 'CUSTOM'
    };
    
    await storeTransactionInSupabase(transactionData);
    
    // Create simplified response with just the essential data
    const responseData = {
      order_id: orderId,
      amount: parseFloat(amount),
      currency: "INR",
      status: "ACTIVE",
      customer_details: {
        customer_id: user.id || "clerk_user",
        customer_name: user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user.username || "User",
        customer_email: user.email_addresses?.[0]?.email_address || "demo@example.com",
        customer_phone: user.phone_numbers?.[0]?.phone_number?.replace('+91', '') || "9999999999"
      }
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

// Add a new endpoint to update payment status
app.post('/api/update-payment-status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, paymentId } = req.body;
    
    if (!orderId || !status) {
      return res.status(400).json({
        success: false,
        message: 'Order ID and status are required'
      });
    }
    
    console.log(`Updating payment status for order ${orderId} to ${status}`);
    
    // Update transaction status in Supabase
    let dbStatus = 'pending';
    if (status === 'SUCCESS') {
      dbStatus = 'completed';
    } else if (status === 'FAILED' || status === 'CANCELLED') {
      dbStatus = 'failed';
    }
    
    const { data, error } = await supabase
      .from('transactions')
      .update({ 
        status: dbStatus, 
        updated_at: new Date().toISOString(),
        payment_id: paymentId || null
      })
      .eq('order_id', orderId);
      
    if (error) {
      console.error('Error updating transaction in Supabase:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update transaction status',
        error: error
      });
    }
    
    console.log('Transaction updated in Supabase:', data);
    
    // Return success response
    return res.status(200).json({ 
      success: true,
      orderId,
      status: dbStatus
    });
  } catch (error) {
    console.error('Error in update-payment-status endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update payment status',
      error: error?.message || 'Unknown error'
    });
  }
});

// Add an endpoint to fetch payment status
app.get('/api/payment-status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }
    
    console.log(`Fetching payment status for order: ${orderId}`);
    
    // Fetch transaction from Supabase
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('order_id', orderId)
      .single();
    
    if (error) {
      console.error('Error fetching transaction from Supabase:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch transaction status',
        error: error
      });
    }
    
    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    
    // Map Supabase status to response status
    let paymentStatus = "FAILURE";
    if (data.status === 'completed') {
      paymentStatus = "SUCCESS";
    } else if (data.status === 'pending') {
      paymentStatus = "PENDING";
    }
    
    // Return the payment status
    return res.status(200).json({
      success: true,
      orderId,
      status: paymentStatus,
      transaction: data
    });
    
  } catch (error) {
    console.error('Error in payment-status endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment status',
      error: error?.message || 'Unknown error'
    });
  }
});

// Add endpoint to verify UPI intent payment
app.post('/api/verify-upi-payment/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { upiTxnId, status } = req.body;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }
    
    console.log(`Verifying UPI payment for order: ${orderId}, UPI TXN ID: ${upiTxnId}, status: ${status}`);
    
    // In a real implementation, you would verify the UPI transaction with a payment gateway
    // For now, we'll just update the transaction status based on the provided status
    
    let dbStatus = 'pending';
    if (status === 'SUCCESS') {
      dbStatus = 'completed';
    } else if (status === 'FAILED' || status === 'FAILURE') {
      dbStatus = 'failed';
    }
    
    // Update transaction in Supabase
    const { data, error } = await supabase
      .from('transactions')
      .update({ 
        status: dbStatus, 
        updated_at: new Date().toISOString(),
        payment_id: upiTxnId || null,
        payment_method: 'UPI'
      })
      .eq('order_id', orderId);
      
    if (error) {
      console.error('Error updating UPI transaction in Supabase:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update UPI transaction status',
        error: error
      });
    }
    
    console.log('UPI transaction updated in Supabase:', data);
    
    // Return success response
    return res.status(200).json({ 
      success: true,
      orderId,
      status: dbStatus,
      upiTxnId
    });
  } catch (error) {
    console.error('Error in verify-upi-payment endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify UPI payment',
      error: error?.message || 'Unknown error'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 