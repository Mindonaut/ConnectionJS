import { Connection } from './Connection.js'
/**
 * Asynchronous socket
 * Creates an instance of Socket.
 * This socket is designed as to reduce authority needed to be granted to initiate a connection.
 * The socket object itself can be understood as a private interface, and the "connect", "disconnect", and "receive" methods, as public interfaces.
 * 
 */
export class Socket {
	/**
	 * The socket is purposefully asynchronous, in order not to block communications between socket interactions within the same VM.
	 * This socket types operates in "Object mode" by default, so any object can be sent through them. It is up to other objects downstream or upstream to do any encoding/decoding.
	 * @param {*} receive  Allowing the object to be extended with a custom receive function (albeit it could be done by calling super...).
	 * @memberof Socket
	 * 
	 * TODO: Handle socket close, and socket errors notification to user (without event handlers).
	 * TODO: One time only connections (or counted connections, or one per distinct socket connection, but no repeat after disconnection).
	 */
	constructor() {
		// Setting up connection variables
		const connection = new Connection(
			// Providing a receive callback that we can override locally
			(message) => complement.receive(message)
		)

		// Setting up reusable error callback
		const throwDisconnected = () => { throw ("Socket is not connected") }

		/**
		 * Initializing complement capablity holding object (with disconnected state)
		 */
		const complement = {
			connected: false,
			connect: throwDisconnected,
			send: throwDisconnected,
			receive: throwDisconnected,
			disconnect: throwDisconnected,
			offer: throwDisconnected
		}

		/**
		 * Checks whether there is an active connection or not
		 * @returns {Boolean}
		 */
		this.isConnected = () => complement.connected

		// Mapping send capability to the connection's, when socket is connected
		this.send = (...messages) => {
			// If socket is disconnected, throw when trying to send a message on it
			if (!complement.connected) throwDisconnected()
			connection.send(...messages)
			// returning socket to allowing method chaining
			return this
		}

		// Mapping iterator capability to the connection's (regardless)
		this.messages = connection.messages

		// TODO: Tailor connectionOffer/ConnectionToken specifically to a particular complement?
		/**
		 * Connection token/offer/continuation
		 * @param complementReceive 
		 * @param complementDisconnect 
		 * @param complementConnectionOffer 
		 */
		const connectionOffer = (complementReceive, complementDisconnect, complementConnectionOffer) => {
			// Storing complement's socket capabilities
			complement.receive = complementReceive
			complement.disconnect = complementDisconnect
			// If we received a connection offer from the complement, we must complete the connction
			if (complementConnectionOffer) {
				// Keeping track of the complement's connection offer
				complement.offer = complementConnectionOffer
				// Completing the connection by sending our socket capabilities (but no longer an offer)
				complement.offer((...messages) => complement.send(...messages), () => this.disconnect())
			}
			// We map the complement's send capability to the socket's connection
			complement.send = (...messages) => connection.receive(messages)
			// We report the connection to be true
			complement.connected = true
		}

		/**
		 * 
		 * @param complementConnectionOffer 
		 * @returns 
		 */
		this.connect = async (complementConnect) => {
			// If socket is already connected
			if (complement.connected) {
				// If attempting to connect to another socket, throw
				if (complement.connect !== complementConnect) throw ("Socket is already connected")
				// Otherwise, do nothing (already connected to that socket)
				else return this
			}
			// f no connect capability is passed, 
			if (!complementConnect) {
				// we return the connection offer
				return connectionOffer
			}
			// Otherwise we connect
			else {
				// Keeping track of complement's capabilitis
				complement.connect = complementConnect
				// Retrieving connection offer
				complement.offer = await complement.connect()
				// Mapping complement's send to connection's receive function
				complement.send = connection.receive
				// We initiate the reciprocal connection 
				complement.offer((messages) => complement.send(messages), () => this.disconnect(), connectionOffer)
				// Setting the connection status as connected
				complement.connected = true
				// Returning socket (to allow for chainned connection/listening to messages)
				return this
			}
		}

		/**
		 * Disconnect complement
		 */
		this.disconnect = () => {
			// If complement is connected
			if (complement.connected) {
				// Resetting complement's capabilities
				complement.connected = false
				complement.disconnect()
				complement.offer = throwDisconnected
				complement.connect = throwDisconnected
				complement.send = throwDisconnected
				complement.receive = throwDisconnected
				complement.disconnect = throwDisconnected
				// Should we break the async message loop on disconnect? (possible expected behaviour) for now we do.
				// Breaking async messages for await loops
				connection.receive(null)
			}
		}
	}


	/**
	 * Connects in a looser way with other socket types, where authority management is not much of an issue
	 * @returns 
	 */
	static bridge(socket) {
		//TODO: Implement socket error support (an presume that these are going to be connected to another stream on the other side of the socket, so have an internal little protocol deefined with it)

		// Checking that if the instance is of a local socket, the connect function has not been tampered with
		// The advantage of this model is that even though more authority is given than otherwise needed, the class of the socket can be checked and thus the "connect" behaviour as a protocol can be trusted.
		if (socket instanceof Socket) {
			// Do we really need to wrap a local socket? perhaps if it is "the user side" (as opposed to the complement side)... This is simply "daisy chainning" sockets... is this useful?
			var socketBridge = new Socket((...message) => socket.send(...message))
			socket.receive = socketBridge.send
			socket.disconnect = socketBridge.disconnect // is this correct?
			return socketBridge
		}
		// else if it is a web socket (or alike)
		else if (socket.send && socket.onmessage) {
			// Creating socket bridge and mapping functions
			var socketBridge = new Socket((...message) => socket.send(...message))
			socket.onmessage = socketBridge.send
			socket.onclose = socketBridge.disconnect
			return socketBridge
		}
		// If it is a node stream
		else if (socket.on) {
			// Creating socket bridge and mapping functions
			var socketBridge = new Socket((...message) => (socket.send || socket.write)(...message))
			socket.on("message", socketBridge.send)
			socket.on("data", socketBridge.send)
			socket.on("close", socketBridge.disconnect)
			return socketBridge
		}
		// If it is another stream
		else if (socket.write && socket.read) {
			// Creating socket bridge and mapping functions
			var socketBridge = new Socket((...message) => socket.write(...message))
			var message = []
			socket.on("data", (data) => message.push(data))
			socket.on("end", () => {
				socketBridge.send(...message)
			})
			// socketBridge should be garbage collected after disconnect
			socket.on("close", socketBridge.disconnect)
			// handling error using our own inteernal protocol (simply sending the error object, with the first paramter being null)
			socket.on("error", (error) => socket.send(null, error))
			// Connecting socket bridge
			return socketBridge
		}
	}

	/**
	 * 
	 * @param {*} options 
	 * @returns 
	 */
	static getConnectedPair(options) {
		const socket1 = new Socket(options)
		const socket2 = new Socket(options)
		socket1.connect(socket2.connect)
		return [socket1, socket2]
	}
}





/**
 * The advantage of using the socket through async iteration is that can be constructed as "normal" synchronous code, to do error handling, and socket disconnect without using connect/disconnect/error events or callbacks
 */
//(async ()=>{ for await (let message of socket) console.log(...message) })()

/**
Use:
const socket = new Socket()
socket.key (to connect, give socket.key to another agent, with a connect method that can be used... or even it is a function itself)
connection = socket.connect(key)
for await( let message of connection.messages ) {
	console.log(...message) // Message is always an array (is framed) of objects/strings/etc so it can be destructured as desired.
}

// How does the complement end get a connection object? isn't  the socket itself the connection object.. in a way the socket is the connection object...
const socket = new Socket()
var key = socket.key (to connect, give socket.key to another agent, with a connect method that can be used... or even it is a function itself)
// complement end does somethign like socket.connect(complementKey)
// We can simply await on messages, which will start flowing when the other end connects
for await( let message of socket.messages ) {
	console.log(...message) // Message is always an array (is framed) of objects/strings/etc so it can be destructured as desired.
}


How can we combine them?? Is a Socket a connection Object?
A connection we can:
send // messages through
disconnect //from complement end


So instead of calling it socket, you can call it connection. A connection has two sides. It is the base network, and can be the base protocol. These facets can exist "separatedly", and connect... but also disconnect.


Then you can create different connection sides... and connect them. Perhaps then a Socket is an object that enables you to create a one to one connection object, with the help of another "Socket".
We can even generate connection object pairs (like in a stream), simply by creating objects with reciprocal capabilities.
Then, whomever builds the object sends one of them as a reference. (Instead of references)
This means, that agents do not create "sockets", that connect. Since we are presuming an already connected shared reference space, we can simply send the reference to the other side (since we have no use for it otherwise).

So the process is:
Create reciprocal objects that pont to each other and refer to each other. "Connection Objects". (other word of symetrical protocols)


NOTE: Using async iterators and others is a pattern that allows interacting with an object without creating references to outside objects.
The created objects can be made immutable, and as such can "penetrate" each others boudaries from inception, and then allow the users to use them with no posibility of them being altered in any fashion.

const [you, me] = new Connection() // They are the same, we just name them (or even [you, you] when introducing)
send(you)... Sending through a pre-existing connection

And then let them use that object. In a way is a "tunnel" over the existing shared connection (yours mine or otherwise).

We can create other objects, that create pre-connected connections, like routers or hubs, with different logic, the same way we use connections with different logic (but inherit from the same class)
What is important is that these objects basically are self contained, immutable objects (basically distributed protocols), that can be migrated from by invitation (invite to upgrade the protocol).

So at the base of "Protocol" is a simetric object exchange, that comes from any one "upgrading" the protocol.

So both ends need to "Update" their reference in the process. (Or it can be done automatically with the proxy...). This is what the protocol can be! Gaining access to mutually shared interfaces.

But I digress...

The base protocol, over existing network socket paradigm, is about creating a connected pair of objects... or rather mutually referring objects, that after creation need NOT mutate. If they would... they would be a DIFFERENT object.

But this is done via an existing network connection (tcp-ip)... having a live network connection to the internet. (or existing in the same space mutually-interact-able-environment)

So, Protocol's initialization would be on socket creation (through responding as a server, or initiating a connection as "client"), the necessary information is exchanged
that allow the instantiation of mutually referring objects (through a socket!) AND that allows encoding/decoding of both objects and references over that pre-existing connection.
So all objects are effectively tunneled through this "original"/"substrate" betwork connection.

So this basically creates a distributed network that handles "complement" references and the local objects to which those references point to, while mantaining
the connectivity graph without unecessary intermediation... but allowing it when necessary.

This means that the base grammar of this protocol would be one where the "programmers" can define which objects "should" be able to cross boundaries, which ones should never cross ANY boundary, and whch ones can cross a boundary... once? Or perhaps only a certain number of times (the in between).

So protocol enables:
Encoding objects as complement References.
Handing over of complement references across

Before? Object Construction Protocol... which is basically serialization, deserialization.
A VM is an object constructor protocol... so to transform it in a stream of base computer instructions, (rather than human readable code).
- The key enabler and hint giver is the proxy object.
- But we can create ANY ENCODER/DECODER than can create ANY object.
- So the key is serializing an object into the form that can be used to re-construct.
- So, we can make a contract of HOW to program (dynamically... including constructors).
- Where all object classes (that are part of that protocol), are capable of encoding/deconding themselves into this streams.
- What is this base decoding/encoding protocol?
- The base proxy object, but then sub-specifications of finer-grained objects.
- So, we should be able "clone" an object into another, but instead of cloning, we capture the output. So it becomes a time intermediated cloning protocol.

So the base operation of this protocol is to clone. To make copies of itself, through a wire, through shared state, or within the same machine (mutually refering object clones).

This "structured clone protocol", should be able to clone ANY object in the VM... up to the base references, in which case they become shared references. That is the cloning boundary.
To enable protocol we might need to "tool" or "extend" existing objects, since objects without encoders/decoders will be deemed external references (which the encoder of the global environment, accounts for them and knows how to encode them).
So, we must create an environment where all that is needed is handled. Forget about transactions, how to persist/unpersist (even though now obvious), or making it easy to code. Simply use existing semantics.
This can be "ProtocolJS" environment/platform, etc. But if so... this environment would be in essence disconnected. So protoco JS needs to come with what is needed to connect... but then what (without complement references!)

process:
Send a copy of the ProtocolJS class
Connect it to "the local wire".
Be ready to read that wire, and on connection... transfer to your heart's content.

(what is needed)
1. Base protocol (wired eval... done-easy)... small adaptations/scripts or available as it is outright

one for each "wire type" (what is expected to connect on the other side)
- var socket = new Socket.bridge(stdin-stdout/new WebSocketClient.connect()/something else)
- socket.receive = eval // eval is ALREADY A PURE TEXT RECEIVING INTERFACE that can be made also text sending interface.
- within eval: socket.send("response") // socket is available in the context so:
- new EvalSocket(globalThis/context, stream/io)... communication via a serial interface. (that is either sending or transmiting... and that with promises it becomes full duplex).
- For as long as the same i/o stream or substream is used to interact with a complement object, the local executions will be coordinated with the complement ones.
- This is ofcourse then used to code the following protocols


So.. object transfer protocol: Using Eval, plus connecting to a "local wire" contained in the code sent.
We presume a "wire" present on an absolutely isolated otherwise, complement process.

Then by sending a class body, and a line at the end that instantiates it and passing the socket to it (so that it may re-wire, re-purpose)

2. Proxy based Eval Protocol (Javascript as a protocol), so the other end has a proxy that points to the "this" object.. one way... that may program a two ways stream.
- this.eval is included in the package. The proxy is complement "as is". Local proxy ALL intercepted and sent through a socket to a complement end. It has an async interface, so iterators and such need to be used in async mode.
-

3. ObjectTransferProtocol
- Basically, where the "agent" (the VM), knows how to serialize/deserialize any object (already a shared construction language (as opposed to operating language))

4. SharedReferenceProtocol (as a distributed protocol)
- Shared references among multiple network nodes

5. SharedObjectProtocol (an addition on top of the sharedReferences Protocol)
- Shared objects
- Transferable Objects


var interface = new Interface().complement()



The vision... the pathway/shared/journey starting with a computer protocol... to an (evolving) economic system. Connection... (that is the performance)



// MultiSocket
const socket = new MultiSocket()
var connectionOffer = socket.listen()
const connectionOffer = socket.connect()
// or
const connection = socket.connect(connectionOffer) // Can it be done multiple times?


for await( let connection of socket.connections ) {
	for await( let message of connection.messages ) {
		console.log(connection, ...message) // Message is always an array (is framed) of objects/strings/etc so it can be destructured as desired.
	}
}
for await( let message of connection.messages ) {
	console.log(...message) // Message is always an array (is framed) of objects/strings/etc so it can be destructured as desired.
}



Staking through points of stability, is effectively keeping one self bounded by the underlying performance that the network rewards.
But one can have several point of stability... for as long as one always is contained, and bound, in one's own points of stability. (the base stable unit of account)


Protocol
Contract
Interface
Connection

(all very similar... different interface base classes depending on how they get shared. Eclusively: one to one socket, Inclusively: one to many (server), or Shared: many to many (d-network) )
They all are build with "connections" objects + scoped code + connecting substrate/underlying protocol.

The base object is a connection that can not be "disolved" (or maybe it always can, since the disconnect verb is within).

The Socket Object, basically becomes an scafold for the connection object, for connection objects that are not created "centraly":

Connection: toLocal: send(from complement side), disconnect, *messages ; toComplement: receive, disconnect

The connection object is basically the resulting state, and the connect method can not be used.





*/