import { User } from "../models/user.model.js";
import httpStatus from "http-status";
import bcrypt, {hash} from "bcrypt";
import crypto from "crypto";


const login = async (req,res) => {
    const {username, password} = req.body;
    if(!username || !password) {
          return res.status(400).json({message: "Please Provide"})
    }
    try{
        const user = await User.findOne({username});
        if(!user) {
            return res.status(httpStatus.NOT_FOUND).json({message: "User Not Found"})
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if(isMatch){
            let token = crypto.randomBytes(20).toString("hex");
            user.token = token;
            await user.save();
            return res.status(httpStatus.OK).json({ token: token})
        } else {
            return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid Username or Password" })
        }

    } catch(error){
        return res.status(500).json({ message: `Something went wrong ${error}`})

    }
}


const register = async (req, res) => {
    const { name, username, password } = req.body;

    try{
        const existingUser = await User.findOne({ username });
        if(existingUser){
            return res.status(httpStatus.FOUND).json({message: "User already exists"});
        }
        const hashPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name: name,
            username: username,
            password: hashPassword
        });
        await newUser.save();
        res.status(httpStatus.CREATED).json({message: "User Registered"});
    } catch(error) {
        res.status(500).json({message:`Something went wrong ${error}`})

    }

}
export {login, register}