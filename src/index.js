import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import joi from "joi";
import dayjs from "dayjs";

const participantsSchema = joi.object({
  name: joi.string().required(),
});

const messagesSchema = joi.object({
  to: joi.string().required(),
  text: joi.string().required(),
  type: joi.string().valid("message", "private_message"),
});

const app = express();
dotenv.config();
app.use(express.json());
app.use(cors());

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

mongoClient
  .connect()
  .then(() => {
    db = mongoClient.db("API_Bate-papo_Uol");
  })
  .catch((err) => console.log(err));

app.post("/participants", async (req, res) => {
  const { name } = req.body;

  const { error } = participantsSchema.validate(
    { name },
    { abortEarly: false }
  );

  if (error) {
    const erros = error.details.map((detail) => detail.message);
    res.status(422).send(erros);
    return;
  }

  try {
    await db.collection("participants").insertOne({
      name: name,
      lastStatus: Date.now(),
    });
    res.sendStatus(201);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const participants = await db.collection("participants").find().toArray();
    res.status(200).send(participants);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.post("/messages", async (req, res) => {
  const { to, text, type } = req.body;
  const { user } = req.headers;

  const { error } = messagesSchema.validate({ to, text, type });
  if (error) {
    const erros = error.details.map((detail) => detail.message);
    res.status(422).send(erros);
    return;
  }

  const userValidation = await db
    .collection("participants")
    .findOne({ name: user });
  if (!userValidation) {
    res.sendStatus(422);
    return;
  }

  try {
    await db.collection("messages").insertOne({
      from: user,
      to,
      text,
      type,
      time: dayjs().format("HH:mm:ss"),
    });
    res.sendStatus(201);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.get("/messages", async (req, res) => {
    const limit =  parseInt(req.query.limit)
  try {
    const messages = await db.collection("messages").find().toArray();
    res.status(200).send(messages);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.listen(5000, () => console.log(`Server running in port: 5000`));
