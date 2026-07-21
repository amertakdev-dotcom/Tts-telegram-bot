const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    telegramId: {
      type: Number,
      required: true,
      unique: true,
    },
    firstName: {
      type: String,
      default: "",
    },
    username: {
      type: String,
      default: "",
    },
    voice: {
      type: String,
      default: "km-KH-PisethNeural",
    },
    speed: {
      type: Number,
      default: 1.0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);
