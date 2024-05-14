import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser" //this is to use to access users broser cookie or to set cookie 

const app = express()

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials:true
}))

//set how much and what type of data is coming to server
app.use(express.json({limit:"16kb"}))
//to recive data from url browser
app.use(express.urlencoded({extended:true,limit:"16kb"})) //extended is for objects in objects in url
//to maintain public assets in server such as files or folders
app.use(express.static("public"))
//cookie 
app.use(cookieParser())


//import routes here
import userRouter from "./routes/user.routes.js" //when we want import name as we want then do export as default

//routes decleration 
app.use("/api/v1/users" , userRouter) //by using use middleware we are activating our user router || this is prefix

export { app }