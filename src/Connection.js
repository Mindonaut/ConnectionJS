/**
 * A Connection instance is a communication medium/interface between:
 * 1) Senders: those with access to the "send" capability.
 * 2) Receivers: those with access to the "messages" async iterable.
 */
export class Connection {
	/**
	 * The connection construction method, defined the connection capabilities taking advantage of closures to make certain information private.
	 * This allows the connection capabilities to be shared independently of the connection instance, keeping the connection's private state exclusively accesible to the instance itself, and none of its users (following the pattern of trust-worthy medium).
	 * The connection constructor receives one paramter: the receive callback to which the connection's "send" capability must maps to.
	 * When a receive callback is not provided the connection loops back to itself by mapping the send capability to its own receive capability (Making a loopback connection). This connection type is useful as a "shared" connection, when multiple users have access to the same capabilities.
	 * @param {*} peerReceive 
	 */
	constructor(peerReceive = (message) => this.receive(message)) {
		/**
		 * The connection send capability is mapped to the peer receive parameter callback capability.
		 * A message is formed by one or more parameters passed to the send function, which are "framed" as an array.
		 * To access each message frame, the receiver must destructure the message according to their knowledge of it.
		 * @param {...any} message 
		 */
		this.send = (...message) => peerReceive(message)

		// Keeping track of active receivers to efficiently use promise creation/resolution
		var activeReceiverCount = 0

		// Creating initial message promise / handler pair that will enable the "messages" iterable
		var nextMessageHandler
		var nextMessagePromise = new Promise((resolve, reject) => nextMessageHandler = { resolve, reject })

		/** 
		 * The receive capabilty enables the "messages" async iterable
		 * @param {*} message 
		 */
		this.receive = (message) => {
			// If there are active message receivers...
			if (activeReceiverCount > 0) {
				// Retrieving messag handler, and getting ready the next before resolving (to avoid resolving the same promise twice)
				var currentMessageHandler = nextMessageHandler
				// Getting the next message handler ready
				nextMessagePromise = new Promise((resolve, reject) => nextMessageHandler = { resolve, reject })
				// Resolving the current message promise with the message provided
				currentMessageHandler.resolve([message, nextMessagePromise])
			}
		}

		/**
		 * The messages object, is the connection's read interface
		 * It is like a time-array or stream of individual messages/values.
		 */
		this.messages = {
			[Symbol.asyncIterator]: async function* asyncMessageGenerator() {
				var message, messagePromise = nextMessagePromise
				// Incrementing the receiver count to signal connection receiving readyness
				activeReceiverCount++
				while (true) {
					// Wait until next message promise resolves, and retrieve message, and next message promise
					[message, messagePromise] = await messagePromise
					// If message is "null" break the loop
					if (message === null) {
						break
					}
					// otherwise relay message
					else {
						yield message
					}
				}
				// Decrementing the receiver count at the end of the loop
				activeReceiverCount--
			}
		}
		// Making instance immutable
		Object.freeze(this)
	}
	messages
	send(...message) { }
	receive(message) { }

	/**
	 * 
	 * @returns 
	 */
	static createLoopBack() {
		return new Connection
	}
	/**
	 * Creates a pair of reciprocally connected, connection instances, creating a bidirectional, simultaneous message stream
	 * One is meant to be "kept" by one user, and the other one is meant to be given.
	 * @returns [{Connection}, {Connection}]
	 */
	static createPair() {
		const connection1 = new Connection((message) => connection2.receive(message))
		const connection2 = new Connection((message) => connection1.receive(message))
		return [connection1, connection2]
	}
	/**
	 * 
	 * @param {*} edges 
	 * @returns 
	 */
	static createCycle(edges) {
		const connections = []
		const connectionCycle = {
			connections,
			new: () => {
				const i = connections.length
				const receive = (i == 0) ? message => connections[connections.length - 1].receive(message) : message => connections[i - 1].receive(message)
				connections.push(new Connection(receive))
			}
		}
		for (let i = 0; i < edges; i++)	connectionCycle.new()
		return connectionCycle
	}
	/**
	 * 
	 */
	static createAcyclicNetwork() {
		class Node {
			constructor() {
				this.connections = []
			}
			connect(peerReceive) {
				const connection = new Connection(peerReceive)
				this.connections.push(connection)
				return connection.receive
			}
			spawn() {
				const node = new Node()
				const nodeConnection = new Connection((message) => nodeReceive(message))
				const nodeReceive = node.connect(nodeConnection.receive)
				this.connections.push(nodeConnection)
				return node
			}
		}
		return new Node()
	}
}
// Freezing the class, so it does not get modified at runtime
Object.freeze(Connection)


/**
 * Use:
*/
function example1() {
	// On the connection creator side	
	const [c1, c2] = Connection.createPair()

		//sendToOtherUser(c2); // sending c2 to another user (perhaps through an existing connection)

		; (async () => {
			for await (let message of c1.messages) {
				console.log('Connection 1 message:', ...message)
			}
		})()

		// On the other user's side:
		; (async () => {
			for await (let message of c2.messages) {
				console.log('Connection 2 message:', ...message)
			}
		})()

	// Back to out side
	c1.send("Hello", "world")

	// And again on the other
	c2.send("My", "Framed", "Message")

}
//example1()

function example2() {
	// Creating loop back connection
	const connection = new Connection
		; (async () => {
			for await (let message of connection.messages) {
				console.log('Connection message:', ...message)
			}
		})()
	connection.send("Hello", "world")
}
//example2()

function example3() {
	var node1 = Connection.createAcyclicNetwork()
	var node2 = node1.spawn()
	var node3 = node1.spawn()
	var node4 = node2.spawn()
	var node5 = node3.spawn()
	var node5 = node3.spawn()
}


/* */