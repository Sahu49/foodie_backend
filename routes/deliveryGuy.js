const express = require("express");
const router = express.Router();
var Order = require("../models/order");
var DeliveryGuy = require("../models/deliveryGuy");
const superAdminAuth = require("../middleware/super_admin_middleware");
const auth = require("../middleware/deliveryguyauth");

//==============Seeding===============
// if (process.env.NODE_ENV != "production") {
//   const deliveryGuy_seed = require("../seeds/deliveryGuy_seed");
//   deliveryGuy_seed();
// }

//===========ROUTES==================================




router.get("/test", (req, res) => {
  res.status(200);
  res.send("[SUCCESS]: DeliveryGuy routes connected!");
});

//Router to access all delivery boys.Only SuperAdmin can access list of all delivery boys

router.get("/", superAdminAuth, async (req, res) => {
  try {
    var deliveryGuy = await DeliveryGuy.find({});
    if (!deliveryGuy) {
      res.status(404).send();
    }
    res.json(deliveryGuy);
  } catch (e) {
    res.status(500).send();
  }
});

//Route to create deliveryGuy. Requires superadmin authentication



router.post("/", superAdminAuth, async (req, res) => {
  const deliveryGuy = new DeliveryGuy(req.body.deliveryGuy);
  try {
    await deliveryGuy.save();
    const token = await deliveryGuy.generateAuthToken();
    res.status(201).send({ deliveryGuy, token });
  } catch (e) {
    res.status(400).send(e);
  }
});

//Route to get details o forder for which delivery guy is not assigned



router.get("/notify", auth, async (req, res) => {
  try {
    var delGuy = req.user;
    var data = await Order.find({ deliveryGuy: null });
    res.status(200).send(data);
  } catch (e) {
    res.status(500).send(e);
  }
});

//Route for assign deliveryGuy



router.post("/assign/:id", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      res.status(400).send("Incorrect orderID");
    }
    if (!order.assign) {
      order.deliveryGuy._id = req.user._id;
      order.deliveryGuy.name = req.user.name;
      order.deliveryGuy.phone = req.user.phone;
      order.deliveryGuy.email = req.user.email
      req.user.orders.push(order._id);
      order.assign = true;
      await order.save();
      await req.user.save();
      res.status(200).send(order);
    } else {
      res.status(400).send("DeliveryGuy already Assigned.");
    }
  } catch (error) {
    res.status(500).send(error);
  }
});

//Login Route for deliveryGuy



router.post("/login", async (req, res) => {
  try {
    const deliveryGuy = await DeliveryGuy.findByCredentials(
      req.body.username,
      req.body.password
    );
    const token = await deliveryGuy.generateAuthToken();
    res.send({ deliveryGuy, token });
  } catch (e) {
    res.status(400).send();
  }
});

//Logout route for deliveryGuy



router.post("/logout", auth, async (req, res) => {
  try {
    req.user.tokens = req.user.tokens.filter((token) => {
      return token.token !== req.token;
    });
    await req.user.save();

    res.send("Logged Out");
  } catch (e) {
    res.status(500).send();
  }
});

//Route to logout all sessions



router.post("/logoutAll", auth, async (req, res) => {
  try {
    req.user.tokens = [];
    await req.user.save();
    res.send();
  } catch (e) {
    res.status(500).send();
  }
});

//Route to read deliveryGuy profile


router.get("/me", auth, async (req, res) => {
  const user = req.user;
  const orders = await user.populate("orders").execPopulate();
  res.send(user);
});

//Update route for delivery guy



router.patch("/me", auth, async (req, res) => {
  const updates = Object.keys(req.body);
  const allowedUpdates = ["name","email","phone", "password"]; //Updates allowed for deliveryGuy
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

//Route to delete deliveryGuy profile
router.delete("/me", auth, async (req, res) => {
  try {
    await req.user.remove();
    res.send(req.user);
  } catch (e) {
    res.status(500).send();
  }
});

//Route to get a particular order from objectId of a order.(deliveryGuy authorization required)
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


//Route to delete deliveryGuy
router.delete("/delete/:id",superAdminAuth,async(req, res)=>{
  try {
    const dguy = await DeliveryGuy.findById({_id:req.params.id});
    if(!dguy){
      res.status(500).send("Can not find deliveryBoy")
    }
    const removed = await dguy.remove()
    res.status(200).send(`Removed ${removed.name}`)
  } catch (error) {
    res.status(500).send(error)
  }

})

//Route to get all delivery boys(super admin authentication)
router.get('/all',superAdminAuth,async(req, res)=>{
  try {
    const deliveryGuys = await DeliveryGuy.find({})
    if(!deliveryGuys){
      res.status(500).send("Can not find delivery Guys")
    }
    res.status(200).send(deliveryGuys)
  } catch (error) {
    res.status(500).send(error)
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

//Route to update order status

router.patch("/order/status/:id", auth, async (req, res) => {
  var updatedOrder = {
    status: "DELIVERED"
  }  
  updatedOrder.payment = {}
  updatedOrder.payment.method = "COD"
  updatedOrder.payment.status = "PAID"
  try {
    const order = await Order.updateOne(
      { _id: req.params.id },updatedOrder
    );
    res.status(200).send(`Order status Updated to "Delivered"`);
  } catch (error) {
    res.status(500).send(error);
  }
});

module.exports = router;
