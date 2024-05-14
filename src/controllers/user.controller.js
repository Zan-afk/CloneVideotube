import { asyncHandler } from "../utils/asyncHandler.js" 
import {ApiErrors} from "../utils/ApiErrors.js"
import {User} from "../models/user.model.js"
import{uploadOnCloudinary} from "../utils/cloudinary.js"
import{ApiResponse} from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"


const generateAccessAndRefreshTokens = async(userId) =>{
    try {
        
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({validateBeforeSave: false})

        return {accessToken,refreshToken}

    } catch (error) {
        throw new ApiErrors(500, "something went wrong while generating refresh and access token")
    }
}

//----------------------------------------------------------------------------------

const registerUser = asyncHandler(async (req ,res) => {
    
    const {username, email, fullname, password} = req.body
    // if(username === ""){
    //     throw new ApiErrors(400, "username is required")
    // }

    if (
        [username,email,fullname,password].some((eachFieldOfArr)=>
        (eachFieldOfArr?.trim()===""))) 
        {
            throw new ApiErrors(400, "All fields are required")
    }

    const existedUser = await User.findOne({
        $or:[{username},{email}] //or is checking for multiple parameters
    })

    if (existedUser) {
        throw new ApiErrors(409, "User with email or username already exists")
    }

    //get the avtar file and images
    const avatarLocalPath = req.files?.avatar[0]?.path; //avatar[0] first property of avtar ? optionally
    // const coverImageLocalPath = req.files?.coverimage[0]?.path
    

    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverimage) && req.files.coverimage.length > 0) {
        coverImageLocalPath = req.files.coverimage[0].path
    }

    if(!avatarLocalPath){
        throw new ApiErrors(400, "Avatar file is required")
    }
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!avatar){
        throw new ApiErrors(500, "Avatar file is not uploaded")
    }

    //creating entry of user in DB
    const user = await User.create({
        fullname,
        avatar:avatar.url,
        coverimage:coverImage?.url || "",
        email,
        password,
        username:username.toLowerCase()
    }) 
    //checking actually user created or not and remove password and refresh tokeen field for security
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if (!createdUser) {
        throw new ApiErrors(500, "something went wrong while registering user")
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "user registered successfully")
    )
})

//------------------------------------------------------------------------------------------------

const loginUser = asyncHandler(async (req,res) => {

    const {email , username , password} = req.body
    //console.log(email , password)

    if (!(username || email) ) {
        throw new ApiErrors(400, "username or email is required")
    }

    const user = await User.findOne({
        $or:[{username},{email}]
    })

    if (!user) {
        throw new ApiErrors(404, "User does not exist")
    }

    //console.log(user)
    const isPasswordValid = await user.isPasswordCorrect(password)

    if (!isPasswordValid) {
        throw new ApiErrors(401, "Invalid user credentials")
    }
    //make access token and refresh token
    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)

    // console.log("accessToken: ",accessToken)
    // console.log("refreshToken: ",refreshToken)


    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    //send cookies
    const options = {
        httpOnly: true,
        secure: true 
    }

    return res
    .status(200)
    .cookie("accessToken",accessToken,options)
    .cookie("refreshToken",refreshToken,options)
    .json(
        new ApiResponse(
            200,
            {
                user:loggedInUser,accessToken,refreshToken
            },
            "User logged in successfully"
            )
    )

})


//-----------------------------------------------------------------------------------------------

const logoutUser = asyncHandler(async (req,res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset:{
                refreshToken:1
            }
        },
        {
            new:true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json(new ApiResponse(200,{},"User Logged Out"))

})

//------------------------------------------------------------------------------------------------

const refreshAccessToken = asyncHandler(async(req,res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken //this for mobile app
    if (!incomingRefreshToken) {
        throw new ApiErrors(401, "unauthorizedd request")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
    
        const user = await User.findById(decodedToken?._id)
    
        if (!user) {
            throw new ApiErrors(401, "invalid refresh token")
        }
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiErrors(401, "Refresh token is expired or used")
        }
    
        const options = {
            httpOnly:true,
            secure:true
        }
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
    
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(
                200,
                {accessToken, refreshToken: newRefreshToken},
                "Access Token Refreshed"
            )
        )
    } catch (error) {
        throw new ApiErrors(401, error?.message || "Invalid Refresh Token")
    }
})

//-------------------------------------------------------------------------------------------------
const changeCurrentPassword = asyncHandler(async(req , res) => {
    const { oldPassword , newPassword } = req.body 

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect){
        throw new ApiErrors(400, "Invalid old Password")
    }

    user.password = newPassword
    await user.save({validateBeforeSave:false})

    return res
    .status(200)
    .json(new ApiResponse(200,{},"Password changed successfully"))
})

//-----------------------------------------------------------------------------------------------

const getCurrentUser = asyncHandler(async(req,res) => {
    return res
    .status(200)
    .json(200,req.user,"current user fetched successfully")
})

//--------------------------------------------------------------------------------------------------

const updateAccountDetails = asyncHandler(async(req,res)=>{
    const{fullname,email} = req.body

    if (!fullname || !email) {
        throw new ApiErrors(400, "All fields are required")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                // fullname, these are two methods we can set value of users
                //email:email
                fullname:fullname,
                email:email
            }
        },
        {new:true}
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200,user,"Account details updated successfully"))
})

//----------------------------------------------------------------------------------------------------

const updateUserAvatar = asyncHandler(async(req,res) => {
    const avatarLocalPath = req.file?.path

    if(!avatarLocalPath){
        throw new ApiErrors(400, "Avatar file is missing")
    }

        //TODO: delete old image - assignment

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if(!avatar.url){
        throw new ApiErrors(400, "Error while uploading Avatar")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar : avatar.url
            }
        },
        {
            new:true
        }
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user , "Avatar image updated successfully"))
})

//-----------------------------------------------------------------------------------------------------

const updateUserCoverImage = asyncHandler(async(req,res) => {
    const coverImageLocalPath = req.file?.path

    if (!coverImageLocalPath) {
        throw new ApiErrors(400,"cover image file is misssing")
    }

        //TODO: delete old image - assignment

    const coverimage = await uploadOnCloudinary(coverImageLocalPath)

    if(!coverimage.url){
        throw new ApiErrors(400,"Error while uploading an cover image")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                coverimage:coverimage.url
            }
        },
        {new:true}
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200,user,"cover image updated successfully")
    )
})

//-----------------------------------------------------------------------------------------------------
const getUserChannelProfile = asyncHandler(async(req, res) => {
    const {username} = req.params

    if (!username?.trim()) {
        throw new ApiErrors(400, "username is missing")
    }

    const channel = await User.aggregate([
        {
            $match:{
                username:username?.toLowerCase
            }
        },
        {
            $lookup:{
                from:"subscriptions",
                localField:"_id",
                foreignField:"channel",
                as:"subscribers"
            }
        },
        {
            $lookup:{
                from:"subscriptions",
                localField:"_id",
                foreignField:"subscriber",
                as:"subscribedTo"
            }
        },
        {
            $addFields:{
                subscribersCount:{
                    $size:"$subscribers"
                },
                
                channelsSubscribedToCount:{
                    $size:"$subscribedTo"
                },
                isSubscribed:{
                    $cond:{
                        if:{$in:[req.user?._id, "$subscribers.subscriber"]},
                        then:true,
                        else:false
                    }
                }
                
            }
        },
        {
            $project:{
                username:1,
                email:1,
                fullname:1,
                avatar:1,
                coverimage:1,
                isSubscribed:1,
                channelsSubscribedToCount:1,
                subscribersCount:1
            }
        }
    ])


    if(!channel?.length){
        throw new ApiErrors(404, "channel does not exists")
    }

    return res
    .status(200)
    .json(
        new ApiResponse(200,channel[0],"user channel fetched successfully")
    )

})

//----------------------------------------------------------------------------------------------------
const getWatchHistory = asyncHandler(async(req,res) => {
    const user = await User.aggregate([
        {
            $match:{
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup:{
                from:"videos",
                localField:"watchHistory",
                foreignField:"_id",
                as:"watchHistory",
                pipeline:[
                    {
                        $lookup:{
                            from:"users",
                            localField:"owner",
                            foreignField:"_id",
                            as:"owner",
                            pipeline:[
                                {
                                    $project:{
                                        avatar:1,
                                        fullname:1,
                                        username:1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields:{
                            owner:{
                                $first:"$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            user[0].watchHistory,
            "watch history fetched successfully"
        )
    )
})



export {registerUser , 
        loginUser , 
        logoutUser , 
        refreshAccessToken , 
        changeCurrentPassword , 
        getCurrentUser ,
        updateAccountDetails ,
        updateUserAvatar ,
        updateUserCoverImage ,
        getUserChannelProfile ,
        getWatchHistory
    }