const User = require("../../models/user");

const get_user_detail = async(req,res)=>{
   try {
      const { userId } = req.user
      const user = await User.findById(userId)
      if(!user)
      {
        res.status(404).json({message:"User not found"})
      }
      res.status(200).json({message:'User details',user})
   }
   catch(error)
   {
          res.status(500).json({ message: 'Error getting user details', error: error.message });
 
   }
}
module.exports = get_user_detail