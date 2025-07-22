const express = require('express')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const cors = require('cors')
const port = process.env.PORT || 5000

// middleware 
const allowedOrigins = [
  'http://localhost:5173',
  'https://bistro-boss-2025-25269.web.app'
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


app.use(express.json())
app.use(cookieParser())



// JWT verify middleware
const verifyToken = (req, res, next) => {
    console.log('Token verified');
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).send({ message: 'Unauthorized access - No token' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.log(err);
            return res.status(401).send({ message: 'Unauthorized access - Invalid token' });
        }
        req.user = decoded;
        next();
    });
};





// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.jfgqsm5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {

        const cartCollection = client.db('Bistro-boss-2025').collection('Cart'); // Cart collection




        // Express backend এর route (GET /cart)

        app.get('/cart', verifyToken, async (req, res) => {
            const userEmail = req.query.email;
            const tokenEmail = req.user.email;

            // security check: token email must match query email
            if (userEmail !== tokenEmail) {
                return res.status(403).send({ message: 'Forbidden access' });
            }

            const userCart = await cartCollection.find({ userEmail }).toArray();
            res.send(userCart);
        });


        // POST: Add to cart dashboard food item
        app.post('/cart', verifyToken, async (req, res) => {
            const item = req.body;

            if (!item?.userEmail || item.userEmail !== req.user.email) {
                return res.status(403).send({ message: 'Unauthorized access' });
            }

            const result = await cartCollection.insertOne(item);
            res.send(result);
        });




        // Delete player by id - only if owned by user
        app.delete('/cart/:id', verifyToken, async (req, res) => {
            const id = req.params.id;

            const result = await cartCollection.deleteOne({ _id: new ObjectId(id), userEmail: req.user.email });

            if (result.deletedCount === 1) {
                res.send({ success: true, message: 'Item removed' });
            } else {
                res.status(404).send({ success: false, message: 'Item not found or unauthorized' });
            }
        });

        // Increase quantity
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
                console.error('Error increasing quantity:', error);
                res.status(500).send({ message: 'Internal server error' });
            }
        });

        // Decrease quantity
        app.patch('/cart/decrease/:id', verifyToken, async (req, res) => {
            const id = req.params.id;

            try {
                // প্রথমে ডাটাবেজ থেকে আইটেমটি নিয়ে আসা
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
                console.error('Error decreasing quantity:', error);
                res.status(500).send({ message: 'Internal server error' });
            }
        });


        // Create JWT token and send as httpOnly cookie
        app.post('/jwt', (req, res) => {
            const user = req.body;

            // Optional Suggestion: email check
            if (!user?.email) {
                return res.status(400).send({ success: false, message: '❌ Email is required to generate token' });
            }

            const payload = { email: user.email };

            try {
                const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

                res.cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax'

                });

                res.send({ success: true, message: '✅ Token issued successfully' });

            } catch (error) {
                console.error('JWT Generation Error:', error);
                res.status(500).send({ success: false, message: '❌ Failed to generate token' });
            }
        });

        // ✅ JWT logout route (clear cookie)
        app.post('/logout', (req, res) => {
            res.clearCookie('token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax'
            });
            res.send({ success: true, message: '✅ Logged out successfully' });
        });





        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Bistro boss Mogodb running");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('  boss  running!')
})

app.listen(port, () => {
    console.log(`Bistro boss server running ${port}`)
})
