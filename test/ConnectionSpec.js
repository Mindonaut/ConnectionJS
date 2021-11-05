import chai from 'chai'
import { Connection } from "../src/Connection.js"
const expect = chai.expect

it('Allows async iteration', async () => {
	var connection = new Connection
	// Sending async message 5 times with the help of setInterval
	var messageCount = 0
	var interval = setInterval(() => {
		if (messageCount === 5) {
			clearInterval(interval)
			connection.receive(null)
		}
		else {
			connection.send(`${messageCount}`)
			messageCount++
		}
	})

	var messages = []
	for await (let message of connection.messages) {
		messages.push(...message)
	}

	expect(messages.length).to.equal(5);
	expect(messages.join("")).to.equal("01234");

})