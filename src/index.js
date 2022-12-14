import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import joi from "joi";
import dayjs from "dayjs";
import { stripHtml } from "string-strip-html";

const participantsSchema = joi.object({
  name: joi.string().required(),
});

const messagesSchema = joi.object({
  to: joi.string().required(),
  text: joi.string().required(),
  type: joi.string().valid("message", "private_message"),
});

const app = express();
app.use(cors());
dotenv.config();
app.use(express.json());

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

mongoClient
  .connect()
  .then(() => {
    db = mongoClient.db("API_Bate-papo_Uol");
  })
  .catch((err) => console.log(err));

async function statusVerification() {
  try {
    const participants = await db.collection("participants").find().toArray();

    for (let i = 0; i < participants.length; i++) {
      if (Date.now() - participants[i].lastStatus > 10000) {
        const { _id, name } = participants[i];
        await db.collection("participants").deleteOne({ _id: _id });
        await db.collection("messages").insertOne({
          from: name,
          to: "Todos",
          text: "sai da sala...",
          type: "status",
          time: dayjs().format("HH:mm:ss"),
        });
      }
    }
  } catch (err) {
    console.log(err);
  }
}

setInterval(statusVerification, 15000);

app.post("/participants", async (req, res) => {
  const { name } = req.body;

  const { error } = participantsSchema.validate(
    { name },
    { abortEarly: false }
  );

  const sanitizedName = stripHtml(name).result.trim();

  if (error) {
    const erros = error.details.map((detail) => detail.message);
    res.status(422).send(erros);
    return;
  }

  try {
    await db.collection("participants").insertOne({
      name: sanitizedName,
      lastStatus: Date.now(),
    });
    await db.collection("messages").insertOne({
      from: sanitizedName,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: dayjs().format("HH:mm:ss"),
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
    const errors = error.details.map((detail) => detail.message);
    res.status(422).send(errors);
    return;
  }

  const sanitizedTo = stripHtml(to).result.trim();
  const sanitizedText = stripHtml(text).result.trim();
  const sanitizedType = stripHtml(type).result.trim();
  const sanitizedUser = stripHtml(user).result.trim();

  const userValidation = await db
    .collection("participants")
    .findOne({ name: sanitizedUser });
  if (!userValidation) {
    res.sendStatus(422);
    return;
  }

  try {
    await db.collection("messages").insertOne({
      from: sanitizedUser,
      to: sanitizedTo,
      text: sanitizedText,
      type: sanitizedType,
      time: dayjs().format("HH:mm:ss"),
    });
    res.sendStatus(201);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.get("/messages", async (req, res) => {
  const limit = parseInt(req.query.limit);
  const { user } = req.headers;
  try {
    const messages = await db.collection("messages").find().toArray();
    const isForYou = messages.filter(
      (message) =>
        message.type === "message" ||
        message.to === user ||
        message.to === "Todos" ||
        message.from === user
    );
    const indexsOfMessages = isForYou.length - 1;
    const limitMessages = isForYou.filter(
      (m, i) => i > indexsOfMessages - limit
    );
    res.status(200).send(limitMessages);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.post("/status", async (req, res) => {
  const { user } = req.headers;

  try {
    const participant = await db
      .collection("participants")
      .findOne({ name: user });

    if (!participant) {
      res.sendStatus(404);
      return;
    }

    await db
      .collection("participants")
      .updateOne(
        { _id: participant._id },
        { $set: { lastStatus: Date.now() } }
      );
    res.sendStatus(201);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.delete("/messages/:id", async (req, res) => {
  const { user } = req.headers;
  const { id } = req.params;

  try {
    const thisMessageExist = await db
      .collection("messages")
      .findOne({ _id: ObjectId(id) });
    if (!thisMessageExist) {
      res.sendStatus(404);
      return;
    }

    if (thisMessageExist.from !== user) {
      res.sendStatus(401);
      return;
    }

    await db.collection("messages").deleteOne({ _id: ObjectId(id) });
    res.sendStatus(200);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.put("/messages/:id", async (req, res) => {
  const body = req.body;
  const from = req.headers.user;
  const id = ObjectId(req.params.id);

  console.log(from);

  const { error } = messagesSchema.validate(body);
  if (error) {
    const errors = error.details.map((detail) => detail.message);
    res.status(422).send(errors);
    return;
  }

  const sanitizedTo = stripHtml(body.to).result.trim();
  const sanitizedText = stripHtml(body.text).result.trim();
  const sanitizedType = stripHtml(body.type).result.trim();

  const thisMessageExist = await db.collection("messages").findOne({ _id: id });
  if (!thisMessageExist) {
    res.sendStatus(404);
    return;
  }

  if (thisMessageExist.from !== from) {
    res.sendStatus(401);
    return;
  }

  await db.collection("messages").updateOne({ _id: id }, { $set: {to: sanitizedTo, text: sanitizedText, type: sanitizedType} });
  res.sendStatus(200);
});

app.listen(5000, () => console.log(`Server running in port: 5000`));
