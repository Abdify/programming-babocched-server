const jwt = require("jsonwebtoken");


const verifyRefreshToken = (req, res, next) => {
    const refreshToken = req.headers["x-refresh-token"];
    if (refreshToken) {
        jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, decoded) => {
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

module.exports = verifyRefreshToken;