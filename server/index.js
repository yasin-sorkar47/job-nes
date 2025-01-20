require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const port = process.env.PORT || 9000;
const app = express();

app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// 1. install jwt token
// 2. import jwt token package
// 3. to make token jwt.sing(data, secret Key,  {
//   httpOnly: true,
//   secure: false, // for development environment
//   sameSite: "strict",
// })  then add cors config {
//   origin: ["http://localhost:5173"],
//   credentials: true,
// } in the client in post url add this  { withCredentials: true }

// to send toke from server to client res.cookie(name, token, options)

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ze0za.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access......." });
  }

  jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access......." });
    }

    req.user = decoded.email;
    next();
  });
};

async function run() {
  try {
    const database = client.db("job-nestDB");
    const jobCollection = database.collection("jobs");
    const bidCollection = database.collection("bids");

    // create jwt token
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.SECRET_KEY, { expiresIn: "1h" });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: false, // for development environment
          sameSite: "strict",
        })
        .send({ status: "success" });
    });

    // create jwt token
    app.get("/clear-jwt", async (req, res) => {
      res
        .clearCookie("token", {
          secure: false, // for development environment
          sameSite: "strict",
        })
        .send({ message: "clear cookie..........." });
    });

    // job related apis
    // post a job
    app.post("/jobs", async (req, res) => {
      const job = req.body;
      const result = await jobCollection.insertOne(job);
      res.send(result);
    });

    // get all jobs
    app.get("/jobs", async (req, res) => {
      const result = await jobCollection.find().toArray();
      res.send(result);
    });

    // get all jobs for all job page
    app.get("/all-jobs", async (req, res) => {
      const filter = req.query.filter;
      const search = req.query.search;
      const sort = req.query.sort;

      let options = {};

      if (sort)
        options = {
          sort: {
            deadLine: sort === "asc" ? 1 : -1,
          },
        };

      let query = {
        job_title: {
          $regex: search,
          $options: "i",
        },
      };
      if (filter) query.category = filter;
      const result = await jobCollection.find(query, options).toArray();
      res.send(result);
    });

    // get a single data
    app.get("/job/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobCollection.findOne(query);
      res.send(result);
    });

    // get jobs based on user
    app.get("/jobs/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const user = req.user;
      if (email !== user) {
        return res.status(403).send({ message: "forbidden access.........." });
      }
      const query = { "buyer.email": email };
      const result = await jobCollection.find(query).toArray();
      res.send(result);
    });

    // delete a job
    app.delete("/jobs/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobCollection.deleteOne(query);
      res.send(result);
    });

    // update job
    app.put("/job/:id", async (req, res) => {
      const id = req.params.id;
      const job = req.body;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: job,
      };
      const result = await jobCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    });

    // bids relate  apis
    app.post("/bids", async (req, res) => {
      const job = req.body;
      // if same person
      const query = { email: job.email, jobId: job.jobId };
      const isExist = await bidCollection.findOne(query);
      if (isExist) {
        return res
          .status(400)
          .send({ message: "you have already bid on this job.." });
      }

      const result = await bidCollection.insertOne(job);

      // increase the bids number
      const filter = { _id: new ObjectId(job.jobId) };
      const updateDoc = {
        $inc: { total_bids: 1 },
      };
      const updatedJob = await jobCollection.updateOne(filter, updateDoc);

      res.send(result);
    });

    // get bids based on user
    app.get("/bids/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await bidCollection.find(query).toArray();
      res.send(result);
    });

    // get bids based on user
    app.get("/bids-request/:email", async (req, res) => {
      const email = req.params.email;
      const query = { buyer: email };
      const result = await bidCollection.find(query).toArray();
      res.send(result);
    });

    // change the bid status
    app.patch("/bids/:id", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const query = { _id: new ObjectId(id) };

      const updateBid = {
        $set: { status },
      };

      const result = await bidCollection.updateOne(query, updateBid);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);
app.get("/", (req, res) => {
  res.send("Hello from job-nest Server....");
});

app.listen(port, () => console.log(`Server running on port ${port}`));
