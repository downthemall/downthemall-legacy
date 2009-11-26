/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is DownThemAll! QueueStore module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developers are Copyright (C) 2007-2009
 * the Initial Developers. All Rights Reserved.
 *
 * Contributor(s):
 *    Stefano Verna <stefano.verna@gmail.com>
 *    Federico Parodi <f.parodi@tiscali.it>
 *    Nils Maier <MaierMan@web.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var EXPORTED_SYMBOLS = ['QueueStore'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const module = Components.utils.import;
const Exception = Components.Exception;

const DB_FILE = 'dta_queue.sqlite';
const DB_FILE_BAK = DB_FILE + ".bak";
const DB_VERSION = 1;

module("resource://dta/timers.jsm");
module("resource://dta/utils.jsm");

const Timers = new TimerManager();

ServiceGetter(this, "Debug", "@downthemall.net/debug-service;1", "dtaIDebugService");

var _connection = null;
var _saveQueue = {};
var _timer = 0;

var QueueStore = {
	init: function() {
		Debug.logString("QueueStore: initialzing");
		let db = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties).get("ProfD", Ci.nsIFile);
		db.append(DB_FILE);
		
		_connection = Cc['@mozilla.org/storage/service;1'].getService(Ci.mozIStorageService)
			.openDatabase(db);
		try {
			if (('schemaVersion' in _connection) && _connection.schemaVersion != DB_VERSION) {
				/*
					migrate data
				*/
				_connection.schemaVersion = DB_VERSION;
				Debug.logString("setting schema version");				
			}
			if (!_connection.tableExists('queue')) {
				_connection.executeSimpleSQL('PRAGMA page_size = 4096');
				_connection.createTable('queue', 'uuid INTEGER PRIMARY KEY AUTOINCREMENT, pos INTEGER, item TEXT');
			}			
		}
		catch (ex) {
			Debug.log("failed to create table", ex);
			// no-op
		}
		try {
			_connection.executeSimpleSQL("PRAGMA journal_mode = MEMORY");
			_connection.executeSimpleSQL("PRAGMA synchronous = NORMAL");
			this._addStmt = _connection.createStatement('INSERT INTO queue (pos, item) VALUES (?1, ?2)');
			this._saveStmt = _connection.createStatement('UPDATE queue SET item = ?2 WHERE uuid = ?1');
			this._savePosStmt = _connection.createStatement('UPDATE queue SET pos = ?2 WHERE uuid = ?1');
			this._delStmt = _connection.createStatement('DELETE FROM queue WHERE uuid = ?1');
		}
		catch (ex) {
			Debug.log("SQLite", _connection.lastErrorString);
		}
		Debug.logString("QueueStore: done initialzing");
	},
	shutdown: function() {
		// fnish any pending operations
		if (_timer) {
			try {
				_timer.cancel();
			}
			catch (ex) { /* don't care */ }
			
			_timer = null;
			this._saveDownloadQueue();
		}
		for each (let e in ['_addStmt', '_saveStmt', '_savePosStmt', '_delStmt']) {
			try {
				this[e].finalize();
				delete this[e];
			}
			catch (ex) {
				// no-op
			}
		}
		try {
			_connection.executeSimpleSQL('VACUUM');
		}
		catch (ex) {
			// no-op
		}
		try {
			_connection.close();
			delete _connection;
		}
		catch (ex) {
			Debug.log("Cannot close!", ex);
		}
		Debug.logString("QueueStore: shutdown complete!");
	},
	beginUpdate: function() {
		if (_connection.transactionInProgress) {
			return;
		}
		_connection.beginTransactionAs(_connection.TRANSACTION_DEFERRED);
	},
	endUpdate: function() {
		if (!_connection.transactionInProgress) {
			return;
		}
		_connection.commitTransaction();
	},
	backup: function() {
		if (!('backupDB' in _connection)) {
			Debug.logString("DB Backup not possible");
			return;
		}
		try {
			if (!_connection.backupDB(DB_FILE_BAK).exists()) {
				throw new Exception("DB Backup failed!");
			} 
		}
		catch (ex) {
			Debug.log("QueueStore: Cannot backup queue", ex);
		} 
	},
	addDownload: function(download, position) {
		if (!download) {
			throw new Exception("You must provide a Download to save!");
		}
		let s = this._addStmt;
		s.bindStringParameter(0, position);
		s.bindStringParameter(1, download);
		s.execute();
		s.reset();
		return _connection.lastInsertRowID;
	},
	saveDownload: function(id, download) {
		if (!download) {
			throw new Exception("You must provide a Download to save!");
		}
		_saveQueue[id] = download;
		if (!_timer) {
			// delay up to 2500 msecs
			_timer = Timers.createOneshot(2500, this._saveDownloadQueue, this);
		}
	},
	_saveDownloadQueue: function() {
		this.beginUpdate();
		let s = this._saveStmt;
		for (let id in _saveQueue) {
			s.bindInt64Parameter(0, id);
			s.bindStringParameter(1, _saveQueue[id]);
			s.execute();			
		}
		s.reset();
		_saveQueue = {};
		_timer = null;
		this.endUpdate();
	},
	savePosition: function(id, position) {
		let s = this._savePosStmt; 
		s.bindInt64Parameter(0, id);
		s.bindInt64Parameter(1, position);
		s.execute();
		s.reset();
	},
	deleteDownload: function(id) {
		if (!id) {
			return;
		}
		this._delStmt.bindInt64Parameter(0, id);
		this._delStmt.execute();
		this._delStmt.reset();
	},

	loadGenerator: function() {
		let stmt = _connection.createStatement('SELECT COUNT(*) FROM queue');
		stmt.executeStep();
		let count = stmt.getInt64(0);
		stmt.finalize();
		delete stmt;
		if (!count) {
			return;			
		}
		stmt = _connection.createStatement('SELECT uuid, item FROM queue ORDER BY pos');
		this.beginUpdate();
		while (stmt.executeStep()) {
			try {
				let dbId = stmt.getInt64(0);
				let elem = stmt.getString(1);
				yield { id: dbId, serial: elem, count: count };
			}
			catch (ex) {
				Debug.log('failed to init a download from queuefile', ex);
			}
		}
		stmt.finalize();
		this.endUpdate();
		delete stmt;
	},
	getQueueSeq: function() {
		let stmt = _connection.createStatement("SELECT seq FROM SQLITE_SEQUENCE WHERE name LIKE '%queue%'");
		let rv = 0;
		if (stmt.executeStep()) {
			rv = stmt.getInt64(0);
		}
		stmt.finalize();
		delete stmt;
		return rv.toString();
	}
};

const SHUTDOWN_TOPIC = 'profile-change-teardown'; 

var ShutdownObserver = {
	get obs() {
		return Cc['@mozilla.org/observer-service;1'].getService(Ci.nsIObserverService);
	},
	install: function() {
		this.obs.addObserver(this, SHUTDOWN_TOPIC, false);
	},
	uninstall: function() {
		this.obs.removeObserver(this, SHUTDOWN_TOPIC);
	},
	observe: function(subject, topic, data) {
		if (topic == SHUTDOWN_TOPIC) {
			try {
				QueueStore.shutdown();
			}
			catch (ex) {
				Debug.log("Failed to shutdown QueueStore", ex);
			}
			this.uninstall();
		}
	}
};

QueueStore.init();
ShutdownObserver.install();