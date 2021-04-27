const jwt = require("jsonwebtoken");

const generateToken = (id) => {
    const token = jwt.sign({ id: id }, process.env.TOKEN_SECRET, {
        expiresIn: "15s",
    });
    return token;
};

module.exports = generateToken;
