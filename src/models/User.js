import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    employeeId: {
      type: String,
      required: true,
      unique: true,
    },
    role: {
      type: [String],
      required: true,
    },
    designation: {
      type: String,
      default: ""
    },
    workType: {
      type: String,
      default: "",
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    joiningDate: {
      type: Date,
      required: true,
    },
    // New fields for Office Chat
    // designation: { // Ensure designation exists and is consistent
    //   type: String,
    //   default: ""
    // },
    description: {
      type: String,
      default: ""
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team'
    }
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
