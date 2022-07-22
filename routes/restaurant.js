const express = require("express");
const router = express.Router();
const multer = require("multer");
const sharp = require("sharp");
const Restaurant = require("../models/restaurant");
const Food = require("../models/food");
const Order = require("../models/order");
const superAdminAuth = require("../middleware/super_admin_middleware");
const auth = require("../middleware/restauth");
const {orderPlaced, orderAccepted, orderRejected, contactDeliveryBoy} = require('../nodemailer/nodemailer')
const DeliveryGuy = require("../models/deliveryGuy")

//==============Seeding===============
// if (process.env.NODE_ENV != "production") {
//   const restaurant_seed = require("../seeds/restaurant_seed");
//   restaurant_seed();
// }

//Function to upload picture of restaurant
const upload = multer({
  limits: {
    fileSize: 1000000,
  },
  fileFilter(req, file, cb) {
    if (!file.originalname.match(/\.(jpg|jpeg|png)$/)) {
      cb(new Error("Please upload jpg,jpeg or png file only"));
    }

    cb(undefined, true);
  },
});

//Function to convert arrayBuffer to base 64
function base64ArrayBuffer(arrayBuffer) {
  var base64 = "";
  var encodings =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  var bytes = new Uint8Array(arrayBuffer);
  var byteLength = bytes.byteLength;
  var byteRemainder = byteLength % 3;
  var mainLength = byteLength - byteRemainder;

  var a, b, c, d;
  var chunk;

  // Main loop deals with bytes in chunks of 3
  for (var i = 0; i < mainLength; i = i + 3) {
    // Combine the three bytes into a single integer
    chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];

    // Use bitmasks to extract 6-bit segments from the triplet
    a = (chunk & 16515072) >> 18; // 16515072 = (2^6 - 1) << 18
    b = (chunk & 258048) >> 12; // 258048   = (2^6 - 1) << 12
    c = (chunk & 4032) >> 6; // 4032     = (2^6 - 1) << 6
    d = chunk & 63; // 63       = 2^6 - 1

    // Convert the raw binary segments to the appropriate ASCII encoding
    base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d];
  }

  // Deal with the remaining bytes and padding
  if (byteRemainder == 1) {
    chunk = bytes[mainLength];

    a = (chunk & 252) >> 2; // 252 = (2^6 - 1) << 2

    // Set the 4 least significant bits to zero
    b = (chunk & 3) << 4; // 3   = 2^2 - 1

    base64 += encodings[a] + encodings[b] + "==";
  } else if (byteRemainder == 2) {
    chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];

    a = (chunk & 64512) >> 10; // 64512 = (2^6 - 1) << 10
    b = (chunk & 1008) >> 4; // 1008  = (2^6 - 1) << 4

    // Set the 2 least significant bits to zero
    c = (chunk & 15) << 2; // 15    = 2^4 - 1

    base64 += encodings[a] + encodings[b] + encodings[c] + "=";
  }

  return base64;
}

//=========================== Routes==================================



router.get("/test", (req, res) => {
  res.status(200);
  res.send("[SUCCESS]: Restaurant routes connected!");
});
/**
 * @swagger
 * path:
 *  /restaurant/test:
 *    get:
 *      summary: check if restaurant router is configured correctly
 *      tags: [Restaurant]
 *      responses:
 *        "200":
 *          description: Test successfull
 *          content:
 *            text/html:
 *              [SUCCESS]: Restaurant routes connected!
 */

router.get("/test", (req, res) => {
  res.status(200);
  res.send("[SUCCESS]: Restaurant routes connected!");
});

router.get("/", (req, res) => {
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

  Restaurant.find({}, {}, query, (err, restaurants) => {
    if (err) {
      console.log(err);
      res.status(500).json(err);
    } else {
      var data = [];
      restaurants.forEach((restaurant) => {
        data.push({
          id: restaurant._id,
          name: restaurant.name,
          //foods: restaurant.foods,
          contactNos: restaurant.contactNos,
          address: restaurant.address,
          email: restaurant.email,
          restId: restaurant.rest_id
        });
      });
      res.json(data);
    }
  });
});



router.post("/", superAdminAuth, async (req, res) => {
  const restaurant = new Restaurant(req.body.restaurant);
  try {
    await restaurant.save();
    const token = await restaurant.generateAuthToken();
    res.status(201).send({ restaurant, token });
  } catch (e) {
    console.log(e);
    res.status(400).send(e);
  }
});

//Login Route for restaurant


router.post("/login", async (req, res) => {
  try {
    const restaurant = await Restaurant.findByCredentials(
      req.body.rest_id,
      req.body.password
    );
    const token = await restaurant.generateAuthToken();
    res.status(200).send({ restaurant, token });
  } catch (e) {
    res.status(500).send(e);
  }
});

//Logout route for restaurant



router.post("/logout", auth, async (req, res) => {
  try {
    req.user.tokens = req.user.tokens.filter((token) => {
      return token.token !== req.token;
    });
    await req.user.save();

    res.status(200).send("Logged Out");
  } catch (e) {
    res.status(500).send(e);
  }
});

//Route to logout all sessions


router.post("/logoutAll", auth, async (req, res) => {
  try {
    req.user.tokens = [];
    await req.user.save();
    res.send("Logged out all sessions");
  } catch (e) {
    res.status(500).send(e);
  }
});

//Route to read restaurant profile


router.get("/me", auth, async (req, res) => {
  res.send(req.user);
});

// update route for the restaurant


router.patch("/", auth, async (req, res) => {
  const updates = Object.keys(req.body);
  const allowedUpdates = ["name", "password", "address", "contactNos","email"];
  const isValidOperation = updates.every((update) =>
    allowedUpdates.includes(update)
  );

  if (!isValidOperation) {
    return res.status(400).send({ error: "Invalid updates!" });
  }
  if (updates.contactNos && !updates.contactNos.isArray()) {
    return res.status(400).send({
      error:
        "contactNos should be an array containing all the numbers of the restaurants including the old ones!",
    });
  }
  try {
    updates.forEach((update) => (req.user[update] = req.body[update]));
    await req.user.save();
    res.status(200).send(req.user);
  } catch (e) {
    res.status(400).send(e);
  }
});


//Route for notification



router.get("/notify", auth, async (req, res) => {
  try {
    var restaurant = req.user;
    var result = await restaurant.populate("orders").execPopulate();
    var data = [];
    result.orders.forEach(async (order) => {
      if (!order.restNotification) {
        data.push(order);
        await Order.findByIdAndUpdate(
          { _id: order._id },
          {
            restNotification: true,
          },
          (err, res) => {
            if (err) {
              console.log(err);
            } else {
            }
          }
        );
      }
    });
    res.status(200).send(data);
  } catch (e) {
    res.status(500).send(e);
  }
});

// get the details of the restaurant for details page



router.get("/:_id", async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params._id).populate(
      "foods.foodid"
    );

    if (!restaurant) {
      return res.status(404).json({
        error: "No such restaurant found!",
      });
    }

    res.status(200).json({
      restaurant: restaurant,
      // _id: restaurant._id,
      // name: restaurant.name,
      // contactNos: restaurant.contactNos,
      // address: restaurant.address,
      // foods: restaurant.foods,
      // image: base64ArrayBuffer(restaurant.image)
    });
  } catch (error) {
    res.status(500).json(error);
  }
});

// route to add new food

router.post("/food", auth, async (req, res) => {
  try {
    const food = await Food.findById(req.body.foodid);
    if (!food) {
      res.status(404).json({
        error: "Food doesn't exist",
      });
    } else {
      const restaurant = req.user;
      restaurant.foods.push({
        foodid: req.body.foodid,
        price: req.body.price,
      });
      const result = await restaurant.save();

      food.restaurants.push(result._id);
      food.save();
      res.status(200).send("Food added to restaurant");
    }
  } catch (error) {
    console.log(error);
    res.status(500).json(error);
  }
});

// route to delete food from the restaurant

router.delete("/food", auth, async (req, res) => {
  try {
    const restaurant = req.user;
    restaurant.foods = restaurant.foods.filter((obj) => {
      return obj.foodid != req.body.foodid;
    });
    const food = await Food.findById(req.body.foodid);
    let arr = [];
    for (let i = 0; i < food.restaurants.length; i++) {
      if (food.restaurants[i] != restaurant.id) {
        arr.push(food.restaurants[i]);
      }
    }
    food.restaurants = arr;
    if (food.restaurants.length == 0) {
      await food.remove();
    } else {
      food.save();
    }
    const result = await restaurant.save();
    res.status(200).send("Food Deleted");
  } catch (error) {
    console.log(error);
    res.status(500).json(error);
  }
});

//route to upload image of the restaurant

router.post("/image/avatar", auth, upload.single("image"), async (req, res) => {
  try {
    const buffer = await sharp(req.file.buffer)
      .resize({ width: 500, height: 500 })
      .png()
      .toBuffer();
    req.user.image = buffer;
    await req.user.save();
    res.send("Added Restaurant Picture Successfully");
  } catch (error) {
    console.log(error)
    res.status(400).send(error);
  }
});

//Route to get retaurant image
router.get('/image/avatar/:id', async (req, res) => {
  try {
      const restaurant = await Restaurant.findById({_id: req.params.id})
      res.set('Content-Type','image/png')
      res.status(200).send(restaurant.image)

  } catch (e) {
      res.status(404).send(e)
  }
})

//Route to update order status

router.patch("/status/:id", auth, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      { _id: req.params.id },
      {
        status: "SHIPPED",
      }
    );
    res.status(200).send(`Status Updated to "SHIPPED"`);
  } catch (error) {
    res.status(500).send(error);
  }
});

//Route to accept or order
router.post('/order/acceptreject/accept/:id', auth, async(req, res)=>{
  try {
    const order = await Order.findById(req.params.id)
    if(!order){
      res.json({error: "Can not fetch Order from orderID"})
    }
    orderAccepted({
      email: order.user.email,
      name: order.user.name,
      time: req.body.eta
    })
    const deliveryGuys = await DeliveryGuy.find({})
    if(!deliveryGuys){
      console.log("No delivery Guy found")
    }
    deliveryGuys.forEach( (deliveryGuy)=>{
      contactDeliveryBoy({
        email: deliveryGuy.email,
        orderId: order._id
      })
    })
    order.status = "ACCEPTED"
    order.eta = req.body.eta
    await order.save()

    res.status(200).json({response: "Order Accepted"})
  } catch (error) {
      res.status(500).send(error)
  }
})

//Route to decline order
router.post('/order/acceptreject/reject/:id', auth, async(req, res)=>{
  try {
    const order = await Order.findById(req.params.id)
    if(!order){
      res.json({error:"Can not fetch order from orderID"})
    }
    orderRejected({
      email: order.user.email,
      name: order.user.name
    })
    order.status = "REJECTED"
    await order.save()
    res.status(200).json({message:"Order rejected"})
  } catch (error) {
    res.status(500).send(error)
  }

})

//Route to get a particular order from objectId of a order.(Restaurant authorization required)
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

//Route to delete restaurant
router.delete('/delete/:id',superAdminAuth, async(req, res)=>{
  const restaurant = await Restaurant.findById({_id:req.params.id})
  if(!restaurant){
    res.status(500).send("Invalid restaurant ID")
  }
  const removed = await restaurant.remove()
  res.status(200).send(`Removed ${removed.name}`)
})
module.exports = router;
