const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;
// console.log('JWT_SECRET:', process.env.JWT_SECRET);

// Allowed origins for CORS
const allowedOrigins = [
  'http://localhost:5173',
  'https://bistro-boss-ten.vercel.app',
  'https://bistro-boss-2025-25269.web.app',
  'https://bistro-boss-lsbc2vqdb-no-names-projects.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// JWT verify middleware
const verifyToken = (req, res, next) => {
  let token;

  // 1️⃣ Try from Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 2️⃣ If not in header, try from cookie
  if (!token) {
    token = req.cookies.token;
  }

  // 3️⃣ If still not found, unauthorized
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access - No token' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error('JWT verify error:', err);
      return res.status(401).send({ message: 'Unauthorized access - Invalid token' });
    }
    req.user = decoded;
    next();
  });
};


// MongoDB connection string
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.jfgqsm5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// MongoClient setup
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Multer setup
const uploadFolder = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder);
}

// Multer storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadFolder);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// Multer file filter (only images allowed)
const imageFileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({ storage, fileFilter: imageFileFilter });

// Run function
async function run() {
  try {
    const cartCollection = client.db('Bistro-boss-2025').collection('Cart'); // Cart collection
    const userCollection = client.db('Bistro-boss-2025').collection('Users');
    const ChefCollection = client.db('Bistro-boss-2025').collection('Chef');


    // admin get 
    app.get('/users/admin/:email', async (req, res) => {
      const rawEmail = req.params.email;
      const decodedEmail = decodeURIComponent(rawEmail).toLowerCase(); // 🟢 Fix
      const user = await userCollection.findOne({ email: decodedEmail });

      if (!user) {
        return res.status(404).send({ admin: false, message: "User not found" });
      }

      res.send({ admin: user?.role === 'admin' });
    });
    //login admin check (backend)
    app.get('/users/:email', async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });

      if (!user) {
        return res.status(404).send({ message: 'User not found' });
      }

      res.send(user);
    });

    // user ke admin bananor jonno patch route 
    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { role: 'admin' }
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });


    // POST /users route (with file upload)
    app.post('/users', upload.single('photo'), async (req, res) => {
      try {
        const { name, email: rawEmail, uid, createdAt } = req.body;
        const email = rawEmail?.toLowerCase();

        if (!email || !uid) {
          return res.status(400).send({ message: 'Email and UID are required' });
        }

        const baseUrl = req.protocol + '://' + req.get('host');
        const photoURL = req.file ? `${baseUrl}/uploads/${req.file.filename}` : null;

        const existingUser = await userCollection.findOne({ uid });

        const updateData = {
          name,
          email,

        };

        if (photoURL) {
          updateData.photoURL = photoURL;
        }

        if (existingUser) {
          // ইউজার আপডেট, role ওভাররাইট করো না
          await userCollection.updateOne({ uid }, { $set: updateData });
          return res.status(200).send({ message: 'User updated', photoURL });
        } else {
          // নতুন ইউজার, ডিফল্ট role 'user' সেট করো
          await userCollection.insertOne({
            ...updateData,
            role: 'user',
            photoURL,
            uid,
            createdAt,
          });
          return res.status(201).send({ message: 'User created', photoURL });
        }
      } catch (error) {
        console.error('Error saving user:', error.stack || error);
        res.status(500).send({ message: 'Internal server error' });
      }
    });

    // get all user admindashboard
    app.get('/allusers', async (req, res) => {
      try {
        const result = await userCollection.find().toArray();
        res.send(result);
      } catch (err) {
        console.error("Failed to fetch users:", err);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // dasboard admin banano & delete users
    // PATCH: Update User Role
    app.patch('/users/role/:id', async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;
      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role } }
      );
      res.send(result);
    });

    // DELETE: Delete User
    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const result = await userCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });


    // GET /users/:email route to fetch user info
    app.get('/get-user/:email', async (req, res) => {
      const email = req.params.email?.toLowerCase() // 🔥 lowercase করলাম;

      try {
        const user = await userCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ message: 'User not found' });
        }

        return res.status(200).send(user);
      } catch (error) {
        console.error('Error fetching user:', error.stack || error);
        return res.status(500).send({ message: 'Internal server error' });
      }
    });

    // Serve static files from uploads folder
    app.use('/uploads', express.static(uploadFolder));

    // Cart APIs (same as before)...
    // GET /cart
    app.get('/cart', verifyToken, async (req, res) => {
      const userEmail = req.query.email;
      const tokenEmail = req.user.email;

      if (userEmail !== tokenEmail) {
        return res.status(403).send({ message: 'Forbidden access' });
      }

      const userCart = await cartCollection.find({ userEmail }).toArray();
      res.send(userCart);
    });

    // POST /cart
    app.post('/cart', verifyToken, async (req, res) => {
      const item = req.body;

      if (!item?.userEmail || item.userEmail !== req.user.email) {
        return res.status(403).send({ message: 'Unauthorized access' });
      }

      const result = await cartCollection.insertOne(item);
      res.send(result);
    });

    // DELETE /cart/:id
    app.delete('/cart/:id', verifyToken, async (req, res) => {
      const id = req.params.id;

      const result = await cartCollection.deleteOne({ _id: new ObjectId(id), userEmail: req.user.email });

      if (result.deletedCount === 1) {
        res.send({ success: true, message: 'Item removed' });
      } else {
        res.status(404).send({ success: false, message: 'Item not found or unauthorized' });
      }
    });

    // PATCH increase quantity
    app.patch('/cart/increase/:id', verifyToken, async (req, res) => {
      const id = req.params.id;

      try {
        const filter = { _id: new ObjectId(id), userEmail: req.user.email };
        const update = { $inc: { quantity: 1 } };

        const result = await cartCollection.updateOne(filter, update);

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: 'Item not found or unauthorized' });
        }

        res.send({ message: 'Quantity increased', modifiedCount: result.modifiedCount });
      } catch (error) {
        console.error('Error increasing quantity:', error.stack || error);
        res.status(500).send({ message: 'Internal server error' });
      }
    });

    // PATCH decrease quantity
    app.patch('/cart/decrease/:id', verifyToken, async (req, res) => {
      const id = req.params.id;

      try {
        const item = await cartCollection.findOne({ _id: new ObjectId(id), userEmail: req.user.email });

        if (!item) {
          return res.status(404).send({ message: 'Item not found or unauthorized' });
        }

        if (item.quantity <= 1) {
          return res.status(400).send({ message: 'Quantity cannot be less than 1' });
        }

        const result = await cartCollection.updateOne(
          { _id: new ObjectId(id), userEmail: req.user.email },
          { $inc: { quantity: -1 } }
        );

        res.send({ message: 'Quantity decreased', modifiedCount: result.modifiedCount });
      } catch (error) {
        console.error('Error decreasing quantity:', error.stack || error);
        res.status(500).send({ message: 'Internal server error' });
      }
    });



    // Chef recommendtion API

    app.post('/chef', verifyToken, async (req, res) => {
      const item = req.body;

      // 🔍 Check if item already exists for this user
      const alreadyAdded = await ChefCollection.findOne({
        userEmail: item.userEmail,
        name: item.name // বা item.id যদি থাকে
      });

      if (alreadyAdded) {
        return res.status(400).send({ message: 'Item already exists in cart' });
      }

      // ✅ If not, insert it
      const result = await ChefCollection.insertOne(item);
      res.send(result);
    });

    app.get('/get-chef', verifyToken, async (req, res) => {
      const userEmail = req.query.email;
      const tokenEmail = req.user.email;

      if (userEmail !== tokenEmail) {
        return res.status(403).send({ message: 'Forbidden access' });
      }

      const userCart = await ChefCollection.find({ userEmail }).toArray();
      res.send(userCart);
    });
    // PATCH increase quantity for Chef item
    app.patch('/chef/increase/:id', verifyToken, async (req, res) => {
      const id = req.params.id;

      try {
        const filter = { _id: new ObjectId(id), userEmail: req.user.email };
        const update = { $inc: { quantity: 1 } };

        const result = await ChefCollection.updateOne(filter, update);

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: 'Chef item not found or unauthorized' });
        }

        res.send({ message: 'Quantity increased', modifiedCount: result.modifiedCount });
      } catch (error) {
        console.error('Error increasing Chef quantity:', error.stack || error);
        res.status(500).send({ message: 'Internal server error' });
      }
    });

    // PATCH decrease quantity for Chef item
    app.patch('/chef/decrease/:id', verifyToken, async (req, res) => {
      const id = req.params.id;

      try {
        const item = await ChefCollection.findOne({ _id: new ObjectId(id), userEmail: req.user.email });

        if (!item) {
          return res.status(404).send({ message: 'Chef item not found or unauthorized' });
        }

        if (item.quantity <= 1) {
          return res.status(400).send({ message: 'Quantity cannot be less than 1' });
        }

        const result = await ChefCollection.updateOne(
          { _id: new ObjectId(id), userEmail: req.user.email },
          { $inc: { quantity: -1 } }
        );

        res.send({ message: 'Quantity decreased', modifiedCount: result.modifiedCount });
      } catch (error) {
        console.error('Error decreasing Chef quantity:', error.stack || error);
        res.status(500).send({ message: 'Internal server error' });
      }
    });

    // DELETE Chef item
    app.delete('/chef/:id', verifyToken, async (req, res) => {
      const id = req.params.id;

      try {
        const result = await ChefCollection.deleteOne({ _id: new ObjectId(id), userEmail: req.user.email });

        if (result.deletedCount === 1) {
          res.send({ success: true, message: 'Chef item removed' });
        } else {
          res.status(404).send({ success: false, message: 'Chef item not found or unauthorized' });
        }
      } catch (error) {
        console.error('Error deleting Chef item:', error.stack || error);
        res.status(500).send({ message: 'Internal server error' });
      }
    });



    // JWT generation route
    app.post('/jwt', (req, res) => {
      const user = req.body;

      if (!user?.email) {
        return res.status(400).send({ success: false, message: '❌ Email is required to generate token' });
      }

      const payload = { email: user.email.toLowerCase() };

      try {
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '365d' });

        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax'
        });

        // ✅ token পাঠাও frontend এ
        res.send({
          success: true,
          message: '✅ Token issued successfully',
          token // ✅ Add this!
        });
      } catch (error) {
        console.error('JWT Generation Error:', error.stack || error);
        res.status(500).send({ success: false, message: '❌ Failed to generate token' });
      }
    });


    // Logout route
    app.post('/logout', (req, res) => {
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax'
      });
      res.send({ success: true, message: '✅ Logged out successfully' });
    });

    // Connect MongoDB client & ping
    await client.connect();

    // await client.db("admin").command({ ping: 1 });
    console.log("Bistro boss Mogodb running");
  } finally {
    // Optional: client.close() যদি প্রয়োজন হয়
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('boss running!');
});

app.listen(port, () => {
  console.log(`Bistro boss server running on port ${port}`);
});
// module.exports = app;

