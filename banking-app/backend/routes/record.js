const express = require("express");
const recordRoutes = express.Router();
const dbo = require("../db/conn");
const ObjectId = require("mongodb").ObjectId;
const sha256 = require('js-sha256');
const { Decimal128 } = require("mongodb");

// Sets a session
recordRoutes.route("/setSession").post(async function (req, res) {
    if (req.session.username !== req.body.username) {
      req.session.username = req.body.username;
      req.session.loggedIn = req.body.loggedIn;
      console.log("Session set");
    } 
    else {
      console.log("Session already existed");
    }
    console.log(req.session);
    res.json("{}");
});

// Gets a session
recordRoutes.route("/getSession").get(async function (req, res) {
    if (!req.session.username) {
      console.log("No session found");
      res.json("");
    } else {
      console.log("User is: " + req.session.username);
      res.json({ username: req.session.username })
    }
});

// Ends a session
recordRoutes.route("/endSession").post(async function (req, res) {
  req.session.destroy(err => {
    if(err){
      console.log(err);
    } else {
      res.json({ message: "Session is destroyed" });
    }
  });
});
 
// Hashes and salts password then adds user to db
recordRoutes.route("/users/add").post(async function (req, res) {
    try {
        const db_connect = await dbo.getDb();

        function randomSalt() {
            let arr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let ans = '';

            for (let i = 0; i < 16; i++) {
                ans += arr[(Math.floor(Math.random() * arr.length))];
            }

            return ans;
        }
        
        salt = randomSalt();
        hashedPass = sha256(req.body.password + salt);
        
        const myobj = {
            username: req.body.username,
            password: hashedPass,
            salt: salt
        };
        const result = await db_connect.collection("users").insertOne(myobj);

        const accounts = [
          { user: req.body.username, type: "Checking", balance: Decimal128.fromString("0.00") },
          { user: req.body.username, type: "Savings", balance: Decimal128.fromString("0.00") },
          { user: req.body.username, type: "Credit", balance: Decimal128.fromString("0.00") }
        ];
        await db_connect.collection("accounts").insertMany(accounts);

        res.json(result);
    } catch (err) {
        throw err;
    }
});

// Searches the db by username and returns username and userType
recordRoutes.route("/:username").get(async function (req, res) {
    try {
      const db_connect = await dbo.getDb();
      const myquery = { username: req.params.username };
      const projection = { username: 1, userType: 1 };
      const result = await db_connect.collection("users").findOne(myquery, { projection });
      
      res.json(result);
    } catch (err) {
      throw err;
    }
});

// Authenticates username and password for logging in
recordRoutes.route("/login").post(async function (req, res) {
  try{
    const db_connect = await dbo.getDb();
    const myquery = { username: req.body.username };
    const result = await db_connect.collection("users").findOne(myquery);

    if (!result) {
      res.json({ auth: false, message: "Invalid" });
    }
    else {
      const hashedPass = sha256(req.body.password + result.salt);

      if (hashedPass === result.password){
        res.json({ auth: true, message: "Valid" });
      } 
      else {
        res.json({ auth: false, message: "Invalid" });
      }
    }
  } catch (err) {
    throw err;
  }
});

// Gets all accounts of the current user
recordRoutes.route("/getAccounts").post(async function(req, res) {
  try {
    const db_connect = await dbo.getDb();
    const myquery = { user: req.body.username };
    const result = await db_connect.collection("accounts").find(myquery).toArray();

    res.json(result);
  } catch (err) {
    throw err;
  }
});

// Adds a new transaction
recordRoutes.route("/transfer/add").post(async function(req, res){
  try {
    const db_connect = await dbo.getDb();
    let toAccountType = null;
    let fromAccountType = null;

    const to = parseInt(req.body.to);
    const from = parseInt(req.body.from);

    switch (to) {
      case 0:
        break;
      case 1:
        toAccountType = "Savings";
        break;
      case 2:
        toAccountType = "Checking";
        break;
      case 3:
        toAccountType = "Credit";
        break;
    }
    switch (from) {
      case 0:
        break;
      case 1:
        fromAccountType = "Savings";
        break;
      case 2:
        fromAccountType = "Checking";
        break;
      case 3:
        fromAccountType = "Credit";
        break;
    }

    if (req.body.type === "withdraw") {
      const myquery = { user: req.session.username, type: fromAccountType};
      const account = await db_connect.collection("accounts").findOne(myquery);
      const accountObj = JSON.parse(JSON.stringify(account));

      const currentBal = Number(accountObj.balance.$numberDecimal);
      if (currentBal < Number(req.body.amount)) {
        res.json({ message: "Not enough in money in your account to withdraw that much" });
      } else {
        const newBal = currentBal - Number(req.body.amount);
        const update = { $set: { balance: Decimal128.fromString(newBal.toFixed(2)) } };

        const updatedResult = await db_connect.collection("accounts").updateOne(myquery, update);

        if (updatedResult.modifiedCount === 1) {
          const dateTime = new Date();
          const transferObj = {
            user: req.session.username,
            transferType: req.body.type,
            dateTime: dateTime,
            toAccount: "",
            fromAccount: fromAccountType,
            transferAmount: Decimal128.fromString(Number(req.body.amount).toFixed(2))
          };

          const finResult = await db_connect.collection("transactions").insertOne(transferObj);
          res.json(finResult); 
        }
      }
    } else if (req.body.type === "deposit") {
      const myquery = { user: req.session.username, type: toAccountType};
      const account = await db_connect.collection("accounts").findOne(myquery);
      const accountObj = JSON.parse(JSON.stringify(account));

      const currentBal = Number(accountObj.balance.$numberDecimal);
      const newBal = currentBal + Number(req.body.amount);
      const update = { $set: { balance: Decimal128.fromString(newBal.toFixed(2)) } };

      const updatedResult = await db_connect.collection("accounts").updateOne(myquery, update);

      if (updatedResult.modifiedCount === 1) {
        const dateTime = new Date();
        const transferObj = {
          user: req.session.username,
          transferType: req.body.type,
          dateTime: dateTime,
          toAccount: toAccountType,
          fromAccount: "",
          transferAmount: Decimal128.fromString(Number(req.body.amount).toFixed(2))
        };

        const finResult = await db_connect.collection("transactions").insertOne(transferObj);
        res.json(finResult); 
      }
    } else if (req.body.type === "transfer") {
      const fromquery = { user: req.session.username, type: fromAccountType};
      const fromAccount = await db_connect.collection("accounts").findOne(fromquery);
      const fromObj = JSON.parse(JSON.stringify(fromAccount));

      const currentFromBal = Number(fromObj.balance.$numberDecimal);
      if (currentFromBal < Number(req.body.amount)) {
        res.json({ message: "Not enough money in your account to transfer that much" });
      } else {
        const toquery = { user: req.session.username, type: toAccountType};
        const toAccount = await db_connect.collection("accounts").findOne(toquery);
        const toObj = JSON.parse(JSON.stringify(toAccount));

        const currentToBal = Number(toObj.balance.$numberDecimal);

        const newFromBal = currentFromBal - Number(req.body.amount);
        const newToBal = currentToBal + Number(req.body.amount);

        const fromUpdate = { $set: { balance: Decimal128.fromString(newFromBal.toFixed(2)) } };
        const toUpdate = { $set: { balance: Decimal128.fromString(newToBal.toFixed(2)) } };

        const fromResult = await db_connect.collection("accounts").updateOne(fromquery, fromUpdate);
        const toResult = await db_connect.collection("accounts").updateOne(toquery, toUpdate);

        if (fromResult.modifiedCount === 1 && toResult.modifiedCount === 1) {
          const dateTime = new Date();
          const transferObj = {
            user: req.session.username,
            transferType: req.body.type,
            dateTime: dateTime,
            toAccount: toAccountType,
            fromAccount: fromAccountType,
            transferAmount: Decimal128.fromString(Number(req.body.amount).toFixed(2))
          };

          const finResult = await db_connect.collection("transactions").insertOne(transferObj);
          res.json(finResult);
        }
      }
    }
  } catch (err) {
    throw err;
  }
});

// Gets the transaction history of the specificed account type
recordRoutes.route("/history/:type").post(async function (req, res) {
  try {
    const db_connect = await dbo.getDb();

    let query = { user: req.session.username };
    
    if (req.params.type !== 'all') {
      query = { user: req.session.username, $or: [ {toAccount: req.params.type}, {fromAccount:req.params.type} ] };
    }

    const result = await db_connect.collection("transactions").find(query).sort({ dateTime: -1 }).toArray();
    res.json(result);
  } catch (err) {
    throw err;
  }
});

module.exports = recordRoutes;
