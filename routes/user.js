const express = require("express");
const User = require("../models/user");
const Restaurant = require("../models/restaurant");
const Order = require("../models/order");
const deliveryGuy = require("../models/deliveryGuy");
const auth = require("../middleware/userauth");
const router = express.Router();
const jwt = require("jsonwebtoken")
const superAdminAuth = require('../middleware/super_admin_middleware')
const {orderPlaced} = require("../nodemailer/nodemailer")
const { Parser } = require("json2csv");
const user = require("../models/user");
const restaurant = require("../models/restaurant");

//==============Seeding===============
// if (process.env.NODE_ENV != "production") {
//   const user_seed = require("../seeds/user_seed");
//   user_seed();
// }

//=========================== Routes==================================




router.get("/test", (req, res) => {
  res.status(200);
  res.send("[SUCCESS]: User routes connected!");
});



//Route to create User
router.post("/", async (req, res) => {
  const user = new User(req.body);
  try {
    await user.save();
    const token = await user.generateAuthToken();
    res.status(201).send({ user, token });
  } catch (e) {
    console.log(e);
    res.status(400).send(e);
  }
});



//Login Route for user
router.post("/login", async (req, res) => {
  try {
    const user = await User.findByCredentials(
      req.body.phone,
      req.body.password
    );
    const token = await user.generateAuthToken();
    res.status(200);
    res.send({ user, token });
  } catch (e) {
    res.status(400).send(e);
  }
});



//Logout route for user
router.post("/logout", auth, async (req, res) => {
  try {
    console.log('logout called')
    req.user.tokens = req.user.tokens.filter((token) => {
      return token.token !== req.token;
    });
    await req.user.save();
    console.log("logged out")
    res.send("Logged out");
  } catch (e) {
    console.log(e)
    res.status(500).send(e);
  }
});


router.post("/logoutAll", auth, async (req, res) => {
  try {
    req.user.tokens = [];
    await req.user.save();
    res.send("Logged out all sessions");
  } catch (e) {
    res.status(500).send(e);
  }
});

router.get("/me", auth, async (req, res) => {
  const user = req.user;
  const orders = await user.populate("orders").execPopulate();
  res.status(200);
  res.send({ user });
});


router.patch("/me", auth, async (req, res) => {
  const updates = Object.keys(req.body);
  const allowedUpdates = ["name", "email", "password", "address", "phone"];
  const isValidOperation = updates.every((update) =>
    allowedUpdates.includes(update)
  );

  if (!isValidOperation) {
    return res.status(400).send({ error: "Invalid updates!" });
  }

  try {
    updates.forEach((update) => (req.user[update] = req.body[update]));
    await req.user.save();
    res.status(200).send(req.user);
  } catch (e) {
    res.status(400).send(e);
  }
});


// route to create orders
router.post("/order", auth, async (req, res) => {
  try {
    const user = req.user;
    const { foods, restaurantId, payment } = req.body;
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).send("Restaurant Not found");
    }
    const length = foods.length;
    const newFoods = foods.map((obj) => {
      const price = restaurant.foods.find((doc) => {
        return doc.foodid == obj.foodid;
      }).price;
      return {
        ...obj,
        price: price,
        length: length,
      };
    });
    const order = new Order({
      payment,
    });
    //console.log(newFoods);
    order.setTotal(newFoods);
    if (!req.body.address) {
      order.address = user.address;
    } else {
      order.address = req.body.address;
    }
    await order.setUser(user);
    await order.setRestaurant(restaurant);
    await order.setFoods(newFoods);

    const result = await order.save();
    orderPlaced({
      name : user.name,
      email: restaurant.email,
      orderId: result._id 
    })
    res.status(200).json(result);
  } catch (error) {
    console.log("error: ",error)
    res.status(500).json(error);
  }
});


//Route to cancel order
router.post("/order/cancel/:id", auth, async (req, res) => {
  try {
    // const order = await Order.findByIdAndUpdate(
    //   { _id: req.params.id },
    //   {
    //     status: "CANCELED",
    //   }
    // );
  
    const order = await Order.findById({_id:req.params.id })
    const restaurant = await Restaurant.findById({_id: order.restaurant._id})
    
    restaurant.orders = restaurant.orders.filter((orderId)=> orderId.toString() != order._id.toString())
    req.user.orders = req.user.orders.filter((orderId)=> orderId.toString() != order._id.toString())
   
    await restaurant.save()
    await req.user.save()
    await order.remove()

    res.status(200).json({"status":`Order status Updated to "CANCELED"`});
  } catch (error) {
    console.log(error)
    res.status(500).json(error);
  }
});



//Route to get a particular order from objectId of a order.(User authorization required)
router.get('/order/:id',auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
    if(!order){
      res.json({error:"Incorrect orderID"})
    }

    res.send(order)
  } catch (error) {
    console.log(error)
    res.status(500).send(error)
  }


})
// ********************************************SuperAdmin Routes************************************************
//Route to login as superadmin
router.post('/super', async(req, res)=>{
  try {
    const username = req.body.username
    const password = req.body.password
  
    if((username != process.env.superUsername) || (password != process.env.superPassword) ){
      res.status(401).send("Invalid Credentials")
    }
    const token = jwt.sign({ superAdmin: `${username}${password}` }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE || 129600,
    })
    res.status(200).send({token})
  } catch (error) {
    res.status(500).send(error)
  }


})


//Route to fetch all the orders for superAdmin (Super Admin)
router.get('/super/orders', superAdminAuth, async (req, res)=>{
  try {
    const pageNo = parseInt(req.query.pageNo) || 1;
    const size = parseInt(req.query.size) || 10;
    if (pageNo < 0 || pageNo === 0) {
      response = {
        error: true,
        message: "invalid page number, should start with 1",
      };
      return res.json(response);
    }
    let query = {};
    query.skip = size * (pageNo - 1);
    query.limit = size;
    Order.find({}, {}, query, (err, orders) => {
      if (err) {
        console.log(err)
        res.status(500).json(err);
      } else {
        
        res.status(200).json(orders);
      }
    });
    
  } catch (error) {
    console.log(error)
    res.status(500).send(error)
  }
})

//Route to fetch all orders without pagination in csv format
router.get('/super/allorders', superAdminAuth, async(req, res)=>{
  try {
    const orders = await Order.find({})
    if(!orders){
      res.status(500).send("Unable to fetch orders")
    }
    //Array to store reformatted array
    var newOrders = [] 
    //Function to reformat time
    const formatTime = (createdAt)=>{
      const time = new Date(createdAt)
      return time.toString().substr(0,24)
    }
    //Function to reformat foods array
    const formatFoods = (foods)=>{
      var foodArray=[]
      foods.forEach((food)=>{
        var newFoodObject = {
          quantity: food.quantity,
          name: food.name
        }
        foodArray.push(newFoodObject) 
      })
      return foodArray;
    }
    orders.forEach((order)=> {
      var newOrder = {
        _id: order._id,
        customerName: order.user.name,
        customerPhone: order.user.phone,
        customerEmail: order.user.email,
        restaurantName: order.restaurant.name,
        restaurantPhone: order.restaurant.contactNos[0],
        restaurantEmail: order.restaurant.email,
        address: order.address,
        orderedOn: formatTime(order.createdAt),
        amount: order.payment.total,
        deliveryGuyName: order.deliveryGuy.name,
        deliveryGuyPhone: order.deliveryGuy.phone,
        deliveryGuyEmail: order.deliveryGuy.email,
        foods: formatFoods(order.foods)
      }
      newOrders.push(newOrder);
    })
    const fields = [
      {
        label: "Order ID",
        value: "_id"
      },
    {
      label: "Customer Name",
      value: "customerName"
    },
    {
      label: 'Customer Phone',
      value: "customerPhone"
    },
    {
      label: 'Customer Email',
      value: "customerEmail"
    },
    {
      label: 'Restaurant',
      value: "restaurantName"
    },
    {
      label: 'Restaurant Phone',
      value: "restaurantPhone"
    },
    {
      label: 'Restaurant Email',
      value: "restaurantEmail"
    },
    {
      label: 'Order Amount',
      value: "amount"
    },
    {
      label: 'Delivery Boy',
      value: "deliveryGuyName"
    },
    {
      label: 'Delivery Boy Phone',
      value: "deliveryGuyPhone"
    },
    {
      label: 'Delivery Boy Email',
      value: "deliveryGuyEmail"
    },
    {
      label: 'Customer Address',
      value: "address"
    },
    {
      label: 'Foods',
      value: "foods"
    },
    {
      label: 'Status',
      value: "status"
    },
    {
      label: "Ordered On",
      value: "orderedOn"
    }
    ]
    const json2csvParser = new Parser({fields})
    const ordersCsv = json2csvParser.parse(newOrders)
    res.status(200).send(ordersCsv)  
  } catch (error) {
    console.log(error)
    res.status(500).send(error)
  }
 
})

module.exports = router;
