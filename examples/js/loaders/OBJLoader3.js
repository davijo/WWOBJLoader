/**
 * @author mrdoob / http://mrdoob.com/
 */

'use strict';

THREE.OBJLoader = (function () {

	function OBJLoader( manager ) {
		this.manager = ( manager !== undefined ) ? manager : THREE.DefaultLoadingManager;

		this.materials = null;
		this.group = null;
		this.loadAsArrayBuffer = true;
		this.trimFunction = null;
		this.path = null;

		this.input = null;
		this.debug = false;

		this.reInit( true );
	}

	OBJLoader.prototype.setPath = function ( value ) {
		this.path = value;
	};

	OBJLoader.prototype.setMaterials = function ( materials ) {
		this.materials = materials;
	};

	/**
	 * When this is set the ResponseType of the XHRLoader is set to arraybuffer
	 * and parseArrayBuffer is used.
	 * @param loadAsArrayBuffer
	 */
	OBJLoader.prototype.setLoadAsArrayBuffer = function ( loadAsArrayBuffer ) {
		this.loadAsArrayBuffer = loadAsArrayBuffer;
	};

	OBJLoader.prototype.reInit = function ( loadAsArrayBuffer, path ) {
		this.materials = null;
		this.container = new THREE.Group();
		this.loadAsArrayBuffer = loadAsArrayBuffer;

		// Define trim function to use once
		// Faster to just trim left side of the line. Use if available.
		var trimLeft = function ( line ) { return line.trimLeft(); };
		var trimNormal = function ( line ) { return line.trim(); };
		this.trimFunction = typeof ''.trimLeft === 'function' ?  trimLeft : trimNormal;

		this.setPath( path );
	};

	OBJLoader.prototype.load = function ( url, onLoad, onProgress, onError ) {
		var scope = this;

		var loader = new THREE.XHRLoader( scope.manager );
		loader.setPath( this.path );
		loader.setResponseType( this.loadAsArrayBuffer ? 'arraybuffer' : 'text' );
		loader.load( url, function ( loadedContent ) {

			onLoad( scope.parse( loadedContent ) );

		}, onProgress, onError );
	};

	OBJLoader.prototype.parse = function ( loadedContent ) {

		var objectStore = new InputObjectStore( this.debug, 0 );
		var count = 0;
		var scope = this;

		var objectStoreChangeCallback = function ( nextObjectObjectStore ) {
			objectStore = nextObjectObjectStore;
			if ( scope.debug ) {

				console.log(count);
				count++;

			}
		};
		objectStore.registerObjectStoreChangeCallback( objectStoreChangeCallback );

		if ( this.loadAsArrayBuffer ) {

			console.time( 'ParseAB' );
			var view = new Uint8Array( loadedContent );

			for ( var i = 0, length = view.byteLength; i < length; i++ ) {

				objectStore.processByte( view [ i ] );

			}
			console.timeEnd( 'ParseAB' );

		} else {

			console.time( 'ParseText' );
			for ( var i = 0, length = loadedContent.length; i < length; i++ ) {

				objectStore.processByte( loadedContent[ i ].charCodeAt( 0 ) );

			}
			console.timeEnd( 'ParseText' );

		}
		console.log( 'Line Count: ' + objectStore.lineCount );

		return this.container;
	};

	var InputObjectStore = (function () {

		function InputObjectStore( debug, lineCount ) {

			this.currentInput = null;
			this.comments = new CommentStore( '#' );
			this.vertices = new VertexStore( 'v' );
			this.normals = new VertexStore( 'vn' );
			this.uvs = new VertexStore( 'vt' );
			this.faces = new FaceInput();
			this.groups = new BaseStore( 'g' );
			this.smoothingGroups = new BaseStore( 's' );
			this.useMtls = new BaseStore( 'u' );

			this.afterVertex = false;
			this.lineCount = lineCount;
			this.haveV = false;

			if ( debug ) {
				this.comments.debug = debug;
				this.vertices.debug = debug;
				this.normals.debug = debug;
				this.uvs.debug = debug;
				this.faces.debug = debug;
				this.groups.debug = debug;
				this.smoothingGroups.debug = debug;
				this.useMtls.debug = debug;
			}
 		}
		InputObjectStore.prototype.registerObjectStoreChangeCallback = function ( objectStoreChangeCallback ) {
			this.objectStoreChangeCallback = objectStoreChangeCallback;
		};

		InputObjectStore.prototype.processByte = function ( code ) {

			// detect end of line
			if ( code === 10 || code === 13 ) {

				// if CR exists this.currentInput will be null afterwards
				// LF with CR will then do nothing
				// LF without CR will have this.currentInput != null or null beacause of empty line
				if ( this.currentInput !== null ) {

					this.currentInput.detectedLF();
					this.currentInput = null;

				}

				if ( code === 10 ) {
					this.lineCount ++;
				}

			} else if ( this.currentInput !== null ) {

				this.currentInput.parseObjInput( code );

			// It can be of type 'v', 'vn' and 'vt' in the end
			} else  if ( this.haveV ) {

				if ( code === 110 ) {

					this.afterVertex = true;
					this.currentInput = this.normals;

				} else if ( code === 116 ) {

					this.currentInput = this.uvs;

				} else if ( code === 32 ) {

					// when afterVertex is true a new vertex is added, then this storage has to re-init
					// and provide its data
					if ( this.afterVertex ) {

						var objectStore = new InputObjectStore( false, this.lineCount );
						objectStore.registerObjectStoreChangeCallback( this.objectStoreChangeCallback );
						this.objectStoreChangeCallback( objectStore );

					} else {

						this.currentInput = this.vertices;

					}

				} else {

					console.error( 'No space after v: ' + code + ' line: ' + this.lineCount );
				}

				if ( this.currentInput !== null ) {

					this.currentInput.resetLine();

				}
				this.haveV = false;

			} else {

				switch ( code ) {

					// #
					case 35:
						this.currentInput = this.comments;
						break;

					// v
					case 118:
						// Identify with next character
						this.haveV = true;
						break;

					// f
					case 102:
						this.currentInput = this.faces;
						break;

					// g
					case 103:
						this.currentInput = this.groups;
						break;
					// s
					case 115:
						this.currentInput = this.smoothingGroups;
						break;
					// u
					case 117:
						this.currentInput = this.useMtls;
						break;

					// SPACE at start of line : mark as not usable so far
					case 32:
					default:
						break;
				}

				if ( ! this.haveV && this.currentInput !== null ) {

					this.currentInput.resetLine();

				}
			}
		};

		return InputObjectStore;
	})();


	var BaseStore = (function () {

		function BaseStore( defaultChar ) {
			this.defaultChar = defaultChar;
			this.input = this.defaultChar ? this.defaultChar : '';

			this.buffer = [];
			this.bufferIndex = -1;

			this.debug = false;
		}

		BaseStore.prototype.parseObjInput = function ( code ) {
			this.input += String.fromCharCode( code );
		};

		BaseStore.prototype.verify = function () {
			if ( this.input.length > 0 ) {

				this.buffer.push( this.input );
				this.bufferIndex++;
				this.input = '';

			}
		};

		BaseStore.prototype.detectedLF = function () {
			this.verify();

			if ( this.debug ) {
				console.log( this.buffer[ this.bufferIndex ] );
			}
		};

		BaseStore.prototype.resetLine = function () {
			this.input = this.defaultChar ? this.defaultChar : '';
		};

		return BaseStore;
	})();

	var CommentStore = (function () {

		CommentStore.prototype = Object.create( BaseStore.prototype, {
			constructor: {
				value: CommentStore
			}
		});

		function CommentStore() {
			BaseStore.call( this, '#' );
		}

		return CommentStore;
	})();


	var VertexStore = (function () {

		VertexStore.prototype = Object.create( BaseStore.prototype, {
			constructor: {
				value: VertexStore
			}
		});

		function VertexStore( type ) {
			BaseStore.call( this );
			this.type = type;
		}

		VertexStore.prototype.parseObjInput = function ( code ) {
			// "v   1.0 2.0 3.0" or
			// "vn  1.0 2.0 3.0" or
			// "vt  1.0 2.0 3.0"

			if ( code !== 32) {

				this.input += String.fromCharCode( code );

			} else {

				this.verify();

			}
		};

		VertexStore.prototype.detectedLF = function () {
			this.verify();

			if ( this.debug ) {
				var sub = 2;
				if ( this.type === 'vt' ) {
					sub = 1;
				}
				console.log( this.type + ': ' + this.buffer.slice( this.bufferIndex - sub, this.bufferIndex ) );
			}
		};

		return VertexStore;
	})();

	var FaceInput = (function () {

		FaceInput.prototype = Object.create( BaseStore.prototype, {
			constructor: {
				value: FaceInput
			}
		});

		function FaceInput() {
			BaseStore.call( this );

			// possible types
			// 0: "f vertex/uv/normal	vertex/uv/normal	vertex/uv/normal"
			// 1: "f vertex/uv			vertex/uv			vertex/uv"
			// 2: "f vertex//normal		vertex//normal		vertex//normal"
			// 3: "f vertex				vertex				vertex"
			this.typesPerLine = [];
			this.slashes = [];
			this.slashIndex = 0;
		}

		FaceInput.prototype.parseObjInput = function ( code ) {

			if ( code !== 32 && code !== 47 ) {

				this.input += String.fromCharCode( code );

			} else {

				if ( code === 47 ) {

					this.slashes.push( this.slashIndex );

				}
				this.verify();

			}
			this.slashIndex++;
		};

		FaceInput.prototype.detectedLF = function () {
			this.verify();

			// identify type
			var slashesLength = this.slashes.length;
			var type;
			if ( slashesLength === 0 ) {

				type = 3;

			} else if ( slashesLength === 3 ) {

				type = 1;

			} else if ( slashesLength === 6 ) {

				type = this.slashes[ 1 ] - this.slashes[ 0 ] === 1 ? 2 : 0;

			}

			this.typesPerLine.push( type );

			if ( this.debug ) {
				var sub = 2;
				if ( type === 1 || type === 2 ) {
					sub = 5;
				} else if ( type === 0 ) {
					sub = 8;
				}
				console.log( type + ': ' + this.buffer.slice( this.bufferIndex - sub, this.bufferIndex ) );
			}

		};

		FaceInput.prototype.resetLine = function () {
			this.slashes = [];
			this.slashIndex = 0;
			this.input = '';
		};

		return FaceInput;
	})();

	return OBJLoader;
})();