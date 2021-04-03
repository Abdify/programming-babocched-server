//dependencies
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const MongoClient = require("mongodb").MongoClient;
const { ObjectId } = require("bson");
require("dotenv").config();

const port = process.env.PORT || 5000;

const app = express();

//middleware
app.use(cors());
app.use(express.json());

const verifyJwt = (req, res, next) => {
    const token = req.headers["x-access-token"];

    if (token) {
        jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
            if (!err) {
                //success
                req.userId = decoded.id;
                next();
            } else {
                res.send({ message: "token doesn't match!" });
            }
        });
    } else {
        res.send({ message: "No token found!" });
    }
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.d7fiy.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
client.connect((err) => {
    console.log("Errors found: ", err);
    const usersCollection = client.db(process.env.DB_NAME).collection("users");
    const questionsCollection = client.db(process.env.DB_NAME).collection("questions");
    const answersCollection = client.db(process.env.DB_NAME).collection("answers");

    app.post("/addUser", (req, res) => {
        const newUser = req.body;
        usersCollection.find({ email: newUser.email }).toArray((err, user) => {
            if (user.length > 0) {
                res.send({
                    success: false,
                    message: "User already exists with this email! Please log in.",
                });
            } else {
                usersCollection.insertOne(newUser).then((result) => {
                    if (result.insertedCount > 0) {
                        res.send({
                            success: true,
                            message: "Created account",
                        });
                    } else {
                        res.send({
                            success: false,
                            message: "Could not create account! please try again!",
                        });
                    }
                });
            }
        });
    });

    app.post("/login", (req, res) => {
        const user = req.body;
        usersCollection.findOne({ email: user.email }).then((emailVerifiedUser) => {
            if (emailVerifiedUser) {
                usersCollection
                    .findOne({ password: user.password })
                    .then((passwordVerifiedUser) => {
                        if (passwordVerifiedUser) {
                            // Successfully logged in
                            const { _id, userName, email } = passwordVerifiedUser;
                            // Generate token
                            const token = jwt.sign(
                                { id: passwordVerifiedUser._id },
                                process.env.TOKEN_SECRET,
                                {
                                    expiresIn: 600,
                                }
                            );
                            console.log(user);
                            res.send({
                                success: true,
                                token: token,
                                user: { _id, userName, email },
                            });
                        } else {
                            res.send({ success: false, message: "Wrong password!" });
                        }
                    });
            } else {
                res.send({
                    success: false,
                    message: "No user found with this email, create an account first",
                });
            }
        });
    });

    app.post("/ask", verifyJwt, (req, res) => {
        usersCollection.findOne({ _id: ObjectId(req.userId) }).then((user) => {
            const question = req.body;
            const { _id, userName, email } = user;
            question.askedBy = { _id, userName, email };
            console.log(question);
            questionsCollection.insertOne(question).then((result) => {
                res.send(result.insertedCount > 0);
            });
        });
    });

    app.post("/writeAnswer", verifyJwt, (req, res) => {
        usersCollection
            .findOne({ _id: ObjectId(req.userId) })
            .then((user) => {
                const answer = req.body;
                const { _id, userName, email } = user;
                answer.answeredBy = { _id, userName, email };
                console.log(answer);
                answersCollection
                    .insertOne(answer)
                    .then((result) => {
                        res.send({
                            success: true,
                            message: "Successfully added your answer, thank you for contributing😊",
                        });
                    })
                    .catch((err) =>
                        res.send({
                            success: false,
                            message:
                                "Something went wrong! please try again!",
                        })
                    );
            })
            .catch((err) =>
                res.send({
                    success: false,
                    message: "You are not authorized to write answer! please log in first...",
                })
            );
    });

    app.get("/getUser", verifyJwt, (req, res) => {
        usersCollection.findOne({ _id: ObjectId(req.userId) }).then((user) => {
            // console.log(user);
            const { _id, userName, email } = user;
            res.send({ auth: true, user: { _id, userName, email } });
        });
    });

    app.get("/questions", (req, res) => {
        questionsCollection
            .find({})
            .limit(20)
            .toArray((err, questions) => {
                res.send(questions);
            });
    });

    app.get("/questions/:id", (req, res) => {
        const id = req.params.id;
        questionsCollection.findOne({ _id: ObjectId(id) }).then((question) => {
            res.send(question);
        });
    });
});

app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.listen(port, () => {
    console.log(`Making bebocched at http://localhost:${port}`);
});
