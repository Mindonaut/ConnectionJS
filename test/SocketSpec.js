import chai from 'chai'
import { Socket } from "../src/Socket.mjs"
const expect = chai.expect

it('Connects and disconnects', async () => {
	var messages = []
	// Creating socket 1
	const socket1 = new Socket
		// Listening to messages on socket 1
		; (async () => {
			for await (let message of socket1.messages) {
				console.log("socket 2: ", ...message)
				messages.push(message)
			}
		})()

	// Creating socket 2 
	const socket2 = new Socket
		// Listening to messages on socket 2
		; (async () => {
			for await (let message of socket2.messages) {
				console.log("socket 1: ", ...message)
				messages.push(message)
			}
		})()
	// Checking that both sockets report being disconnected now
	expect(socket1.isConnected()).to.be.false
	expect(socket2.isConnected()).to.be.false

	// Connecting to socket by passing a connect capability
	await socket2.connect(socket1.connect)

	// Checking that both sockets report being connected now
	expect(socket1.isConnected()).to.be.true
	expect(socket2.isConnected()).to.be.true

	// Sending messages synchronously
	socket1.send("Hello 1")
	socket2.send("Hello 2")
	socket1.send("Hello again 1!")
	socket1.send("Hello again 1!")
	socket1.send("Hello again 1!")
	socket1.send("Hello again 1!")
	socket1.send("Hello again 1!")
	console.log(messages)

	// // Checking messages where proceessed in the same order they where sent
	// expect(messages.length).to.equal(3)
	// expect(messages.join(", ")).to.equal("Hello 1, Hello 2, Hello again 1!")

	// // Resetting the message array
	// //messages.length = 0
	// // Sending message asynchronously 5 times with the help of setInterval
	// var messageCount = 0
	// await new Promise((resolve) => {
	// 	var interval = setInterval(() => {
	// 		if (messageCount === 5) {
	// 			clearInterval(interval)
	// 			resolve()
	// 		}
	// 		else {
	// 			socket1.send(`${messageCount}`)
	// 			messageCount++
	// 		}
	// 	})
	// })
	// // Checking all messages arrived, and in the same order
	// expect(messages.length).to.equal(5);
	// expect(messages.join("")).to.equal("01234");

	// // Disconnecting one socket should disconnect both
	// socket1.disconnect()
	// expect(socket1.isConnected()).to.be.false
	// expect(socket2.isConnected()).to.be.false

})

/**
const myMessages = []
; (async () => {
			for await (let message of messages) {
				myMessages.push(...message)
			}
		})()


 */