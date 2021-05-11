//dependencies
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const MongoClient = require("mongodb").MongoClient;
const { ObjectId } = require("bson");
require("dotenv").config();
const verifyRefreshToken = require("./helpers/verifyRefreshToken.js");
const generateToken = require("./helpers/generateToken.js");

const port = process.env.PORT || 5000;

const app = express();

//middleware
app.use(cors());
app.use(express.json());

const verifyJwt = (req, res, next) => {
    const token = req.headers["x-access-token"];
    if (token === "null") {
        res.send({ auth: false, message: "No token found!" });
        return;
    }

    jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
        if (!err) {
            //success
            req.userId = decoded.id;
            next();
        } else {
            if (err.expiredAt) {
                console.log("tokenExpired");
                res.send({ auth: false, message: "token expired!", tokenExpired: true });
            } else {
                res.send({ auth: false, message: "token doesn't match!" });
            }
        }
    });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.d7fiy.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
client.connect((err) => {
    console.log("Errors found: ", err);
    const usersCollection = client.db(process.env.DB_NAME).collection("users");
    const questionsCollection = client.db(process.env.DB_NAME).collection("questions");
    const answersCollection = client.db(process.env.DB_NAME).collection("answers");
    const reactionsCollection = client.db(process.env.DB_NAME).collection("reactions");
    const visitorsCollection = client.db(process.env.DB_NAME).collection("visitors");
    const reviewsCollection = client.db(process.env.DB_NAME).collection("reviews");

    const checkUserStatus = (req, res, next) => {
        usersCollection.findOne({ _id: ObjectId(req.userId) }).then((result) => {
            req.userStatus = result.userStatus;
            next();
        });
    };

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
                            const token = generateToken(passwordVerifiedUser._id);
                            const refreshToken = jwt.sign(
                                {
                                    id: passwordVerifiedUser._id,
                                },
                                process.env.REFRESH_TOKEN_SECRET,
                                { expiresIn: "1y" }
                            );
                            res.send({
                                success: true,
                                token,
                                refreshToken,
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
            const { _id, userName, email } = user;
            const question = req.body;
            question.askedBy = { _id, userName, email };
            question.thumbsUpCount = 0;
            question.answerCount = 0;
            question.viewCount = 0;
            console.log(question);
            questionsCollection
                .insertOne(question)
                .then((result) => {
                    if (result.insertedCount > 0) {
                        res.send({ success: true });
                        console.log(result.ops[0]._id);
                        return result.ops[0]._id;
                    }
                })
                .then((qId) => {
                    console.log(qId);
                    qId && reactionsCollection.insertOne({ reactionsOf: qId, users: [] });
                });
        });
    });

    app.post("/editQuestion/:id", verifyJwt, (req, res) => {
        const id = req.params.id;

        questionsCollection
            .findOne({ _id: ObjectId(id) })
            .then((question) => {
                if (question.askedBy._id == req.userId) {
                    // console.log(question.questionText, req.userId)
                    questionsCollection
                        .findOneAndUpdate(
                            { _id: question._id },
                            {
                                $set: {
                                    questionTitle: req.body.questionTitle,
                                    questionText: req.body.questionText,
                                    // questionLanguage: req.body.questionLanguage,
                                    tags: req.body.tags,
                                    updatedAt: req.body.updatedAt,
                                },
                            }
                        )
                        .then((result) => {
                            if (result.lastErrorObject.updatedExisting) {
                                res.send({
                                    success: true,
                                    message:
                                        "Successfully updated your question, thank you for contributing😊",
                                });
                            } else {
                                res.send({
                                    success: false,
                                    message: "Something went wrong! please try again!",
                                });
                            }
                        })
                        .catch((err) => console.log(err));
                } else {
                    res.send({ success: false, message: "You are not authorized to do this!" });
                }
            })
            .catch((err) => {
                console.log(err);
                res.send({ success: false, message: "Question not found! Ask one if you wish..." });
            });
    });

    app.post("/editAnswer/:id", verifyJwt, (req, res) => {
        const id = req.params.id;

        answersCollection
            .findOne({ _id: ObjectId(id) })
            .then((answer) => {
                if (answer.answeredBy._id == req.userId) {
                    answersCollection
                        .findOneAndUpdate(
                            { _id: answer._id },
                            {
                                $set: {
                                    answerText: req.body.answerText,
                                    code: req.body.code,
                                    updatedAt: req.body.updatedAt,
                                },
                            }
                        )
                        .then((result) => {
                            if (result.lastErrorObject.updatedExisting) {
                                res.send({
                                    success: true,
                                    message:
                                        "Successfully updated your answera, thank you for contributing😊",
                                });
                            } else {
                                res.send({
                                    success: false,
                                    message: "Something went wrong! please try again!",
                                });
                            }
                        })
                        .catch((err) => console.log(err));
                } else {
                    res.send({ success: false, message: "You are not authorized to do this!" });
                }
            })
            .catch((err) => {
                console.log(err);
                res.send({
                    success: false,
                    message: "Answer not found! Write one if you wish...",
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
                answer.thumbsUpCount = 0;
                console.log(answer);
                answersCollection
                    .insertOne(answer)
                    .then((answerResult) => {
                        console.log(answerResult.ops[0]._id);
                        questionsCollection
                            .findOneAndUpdate(
                                { _id: ObjectId(answer.questionId) },
                                { $inc: { answerCount: 1 } }
                            )
                            .then((result) => {
                                reactionsCollection.insertOne({
                                    reactionsOf: answerResult.ops[0]._id,
                                    users: [],
                                });
                                if (result.lastErrorObject.updatedExisting) {
                                    res.send({
                                        success: true,
                                        message:
                                            "Successfully added your answer, thank you for contributing😊",
                                    });
                                } else {
                                    res.send({
                                        success: false,
                                        message: "Something went wrong! please try again!",
                                    });
                                }
                            });
                    })
                    .catch((err) =>
                        res.send({
                            success: false,
                            message: "Something went wrong! please try again!",
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

    app.post("/updateReaction", verifyJwt, (req, res) => {
        const collection = client.db(process.env.DB_NAME).collection(req.body.type);
        if (req.body.thumbsUp) {
            collection.findOneAndUpdate(
                { _id: ObjectId(req.body.reactionsOf) },
                { $inc: { thumbsUpCount: 1 } }
            );
            reactionsCollection.findOneAndUpdate(
                { reactionsOf: ObjectId(req.body.reactionsOf) },
                { $push: { users: req.userId } }
            );
        } else {
            collection.findOneAndUpdate(
                { _id: ObjectId(req.body.reactionsOf) },
                { $inc: { thumbsUpCount: -1 } }
            );
            reactionsCollection.findOneAndUpdate(
                { reactionsOf: ObjectId(req.body.reactionsOf) },
                { $pull: { users: req.userId } }
            );
        }
    });

    app.post("/addReview", verifyJwt, (req, res) => {
        const reviewInfo = req.body;
        reviewsCollection.insertOne(reviewInfo).then((result) => {
            res.send(result.insertedCount > 0);
        });
    });

    app.get("/reviews", (req, res) => {
        reviewsCollection.find({}).toArray((err, reviews) => {
            res.send(reviews);
        });
    });

    app.get("/getUser", verifyJwt, (req, res) => {
        usersCollection.findOne({ _id: ObjectId(req.userId) }).then((user) => {
            // console.log(user);
            // const { _id, userName, email } = user;
            // res.send({ auth: true, user: { _id, userName, email, } });

            const notAllowed = ["password"];
            Object.keys(user)
                .filter((key) => notAllowed.includes(key))
                .forEach((key) => delete user[key]);
            res.send({ auth: true, user });
        });
    });

    app.get("/refreshToken", verifyRefreshToken, (req, res) => {
        const token = generateToken(req.userId);
        usersCollection.findOne({ _id: ObjectId(req.userId) }).then((user) => {
            // console.log(user);
            const { _id, userName, email } = user;
            res.send({ auth: true, token, user: { _id, userName, email } });
        });
    });

    app.get("/questions", (req, res) => {
        const { sortBy, tag } = req.query;
        const filter = tag ? (tag !== "All" ? { tags: tag } : {}) : {};
        const sort = sortBy
            ? sortBy === "latest"
                ? { askedAt: -1 }
                : { thumbsUpCount: 1 }
            : { askedAt: -1 };
        questionsCollection
            .find(filter)
            .limit(20)
            .sort(sort)
            .toArray((err, questions) => {
                res.send(questions);
            });
    });

    app.get("/questions/top", (req, res) => {
        let topQuestions = [];
        questionsCollection.find({}).toArray((err, questions) => {
            const q = [...questions];
            const sortedByThumbsUp = q.sort((a, b) => b.thumbsUpCount - a.thumbsUpCount);
            const sortedByAnswer = questions.sort((a, b) => b.answerCount - a.answerCount);
            topQuestions = [sortedByThumbsUp[0], sortedByAnswer[0]];
            res.send(topQuestions);
        });
    });

    app.get("/questions/:id", verifyJwt, (req, res) => {
        // Update visitor info
        // Increment view count
        // Send current user isLiked state
        // Send question
        const id = req.params.id;

        const visitorDetail = {
            userId: req.userId,
            time: [new Date().getTime()],
            userAgent: [req.headers["user-agent"]],
            ip: [req.headers["x-forwarded-for"]?.split(",").shift() || req.socket?.remoteAddress],
            visitedUrl: [req.url],
        };

        visitorsCollection.findOne({ userId: visitorDetail.userId }).then((visitor) => {
            if (!visitor) {
                visitorsCollection.insertOne(visitorDetail);
                return;
            }
            const visitorAlreadyVisitedQuestion = visitor.visitedUrl.includes(
                visitorDetail.visitedUrl[0]
            );
            visitorAlreadyVisitedQuestion
                ? {}
                : visitorsCollection.updateOne(
                      { userId: visitorDetail.userId },
                      {
                          $push: {
                              time: visitorDetail.time[0],
                              ip: visitorDetail.ip[0],
                              userAgent: visitorDetail.userAgent[0],
                              visitedUrl: visitorDetail.visitedUrl[0],
                          },
                      }
                  );
        });

        questionsCollection
            .findOneAndUpdate({ _id: ObjectId(id) }, { $inc: { viewCount: 1 } })
            .then((result) => {
                const foundQuestion = result.value;
                reactionsCollection.findOne({ reactionsOf: ObjectId(id) }).then((reaction) => {
                    const userLiked = reaction.users.find((user) => user === req.userId);
                    
                    foundQuestion.thumbsUp = userLiked ? true : false;
                    res.send(foundQuestion);
                });
            })
            .catch((error) => {
                console.log(error);
            });

        // visitorsCollection
        //     .findOneAndUpdate(
        //         { userId: visitorDetail.userId },
        //         {
        //             $push: {
        //                 time: visitorDetail.time[0],
        //                 ip: visitorDetail.ip[0],
        //                 userAgent: visitorDetail.userAgent[0],
        //                 visitedUrl: visitorDetail.visitedUrl[0],
        //             },
        //         }
        //     )
        //     .then((result) => {
        //         if (!result.lastErrorObject.updatedExisting) {
        //             visitorsCollection.insertOne(visitorDetail);
        //         }
        //     });

        // questionsCollection.findOne({ _id: ObjectId(id) }).then((question) => {
        //     reactionsCollection.findOne({ reactionsOf: ObjectId(id) }).then((reaction) => {
        //         const userLiked = reaction.users.find((user) => user === req.userId);
        //         question.thumbsUp = userLiked ? true : false;
        //         res.send(question);
        //     });
        // });
    });

    // Need update!!
    app.get("/answers", verifyJwt, (req, res) => {
        const id = req.query.question;
        answersCollection.find({ questionId: id }).toArray((err, answers) => {
            if (answers.length) {
                answers.map((answer) => {
                    reactionsCollection
                        .findOne({ reactionsOf: ObjectId(answer._id) })
                        .then((reaction) => {
                            const userLiked = reaction?.users.find((user) => user === req.userId);
                            answer.thumbsUp = userLiked ? true : false;
                            // res.send({
                            //     success: true,
                            //     message: `Found ${answers.length} answers!`,
                            //     answers,
                            // });
                        });
                });
                setTimeout(() => {
                    res.send({
                        success: true,
                        message: `Found ${answers.length} answers!`,
                        answers,
                    });
                }, 1000);
            } else {
                res.send({
                    success: false,
                    message: "No answer found for this question",
                });
            }
        });
    });

    app.get("/questionsByTag/:tag", (req, res) => {
        const tag = req.params.tag;
        questionsCollection.find({ tags: tag }).toArray((err, questions) => {
            res.send(questions);
        });
    });

    // Failed to get only the tags!!
    app.get("/tags", (req, res) => {
        questionsCollection
            .find({}, { tags: 1 })
            .limit(100)
            .toArray((err, questions) => {
                const tags = [];
                questions.map((question) => {
                    question.tags?.map((tag) => {
                        !tags.includes(tag) && tags.push(tag);
                    });
                });
                res.send(tags);
            });
    });

    app.get("/userInfo", verifyJwt, checkUserStatus, (req, res) => {
        const filter = req.userStatus === "admin" ? "" : { "askedBy._id": ObjectId(req.userId) };
        questionsCollection
            .find(filter)
            .limit(10)
            .toArray((err, questions) => {
                answersCollection
                    .find({ "answeredBy._id": ObjectId(req.userId) })
                    .toArray((err, answers) => {
                        res.send({
                            questions,
                            answers,
                        });
                    });
            });
    });

    app.get("/search", (req, res) => {
        const query = req.query.query;
        const re = new RegExp(`.*${query}.*`, "i");
        questionsCollection
            .find({ questionTitle: { $regex: re } })
            .limit(10)
            .toArray((err, questions) => {
                res.send(questions);
            });
    });

    // DELETE Question
    app.delete("/question/:id", verifyJwt, (req, res) => {
        const id = req.params.id;

        questionsCollection
            .findOne({ _id: ObjectId(id) })
            .then((question) => {
                if (question?.askedBy._id == req.userId) {
                    const questionId = String(question._id.valueOf());
                    questionsCollection
                        .findOneAndDelete({ _id: question._id })
                        .then((result) => {
                            console.log(result);
                            if (result.ok) {
                                answersCollection
                                    .deleteMany({ questionId: questionId })
                                    .then((updateResult) => {
                                        // console.log("delete " + updateResult + " delete");
                                        res.send({
                                            success: true,
                                            message: "Successfully deleted your weird Question!",
                                        });
                                    })
                                    .catch((err) => console.log(err));
                            } else {
                                res.send({
                                    success: false,
                                    message: "Something went wrong! please try again!",
                                });
                            }
                        })
                        .catch((err) => console.log(err));
                } else {
                    res.send({ success: false, message: "You are not authorized to do this!" });
                }
            })
            .catch((err) => {
                console.log(err);
                res.send({
                    success: false,
                    message: "Question not found! If you want to delete then ask one first!",
                });
            });
    });

    // DELETE Answer
    app.delete("/answer/:id", verifyJwt, (req, res) => {
        const id = req.params.id;

        answersCollection
            .findOne({ _id: ObjectId(id) })
            .then((answer) => {
                if (answer?.answeredBy._id == req.userId) {
                    answersCollection
                        .findOneAndDelete({ _id: answer._id })
                        .then((result) => {
                            console.log(result);
                            if (result.ok) {
                                //which property to confirm??
                                questionsCollection
                                    .findOneAndUpdate(
                                        { _id: ObjectId(answer.questionId) },
                                        { $inc: { answerCount: -1 } }
                                    )
                                    .then((updateResult) => {
                                        res.send({
                                            success: true,
                                            message: "Successfully deleted your weird answer!",
                                        });
                                    });
                            } else {
                                res.send({
                                    success: false,
                                    message: "Something went wrong! please try again!",
                                });
                            }
                        })
                        .catch((err) => console.log(err));
                } else {
                    res.send({ success: false, message: "You are not authorized to do this!" });
                }
            })
            .catch((err) => {
                console.log(err);
                res.send({
                    success: false,
                    message: "Answer not found! If you want to delete then write one first!",
                });
            });
    });

    // Make Admin
    app.put("/makeAdmin", verifyJwt, checkUserStatus, (req, res) => {
        const { newAdminEmail } = req.body;
        if (req.userStatus !== "admin") {
            res.send({ success: false, message: "You are not authorized to do that..." });
            return;
        }
        usersCollection
            .findOneAndUpdate({ email: newAdminEmail }, { $set: { userStatus: "admin" } })
            .then((result) => {
                if (result.lastErrorObject.updatedExisting) {
                    res.send({ success: true, message: "Success!" });
                    return;
                }
                res.send({ success: false, message: "User not found..." });
            });
    });
});

app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.listen(port, () => {
    console.log(`Making babocched at port:${port}`);
});
