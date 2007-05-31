var sessionManager = {

	init: function() {
		this._con = Cc["@mozilla.org/storage/service;1"]
			.getService(Ci.mozIStorageService)
			.openDatabase(DTA_profileFile.get('dta_queue.sqlite'));
		try {
			this._con.executeSimpleSQL('CREATE TABLE queue (uuid INTEGER PRIMARY KEY AUTOINCREMENT, pos INTEGER, item TEXT)');
		} catch (ex) {
			// no-op
		}
		this._saveStmt = this._con.createStatement('REPLACE INTO queue (uuid, pos, item) VALUES (?1, ?2, ?3)');
		this._delStmt = this._con.createStatement('DELETE FROM queue WHERE uuid = ?1');

		this._converter = Components.classes["@mozilla.org/intl/saveascharset;1"]
			.createInstance(Ci.nsISaveAsCharset);
		this._converter.Init('utf-8', 1, 0);
		this._serializer = new XMLSerializer();

		this.load();
	},

	_saveDownload: function(d, pos) {

		if (!(
			(!Prefs.removeCompleted && d.is(COMPLETE))
			|| (!Prefs.removeCanceled && d.is(CANCELED))
			|| (!Prefs.removeAborted && !d.isStarted)
			|| d.is(PAUSED, RUNNING)
		)) {
			return;
		}
		var e = {};
		[
			'fileName',
			'destinationName',
			'numIstance',
			'description',
			'isResumable',
			'alreadyMaskedName',
			'alreadyMaskedDir',
			'mask',
			'originalDirSave',
		].forEach(function(u) { e[u] = d[u]; });
		e.state = d.is(COMPLETE, CANCELED) ? d.state : PAUSED;

		e.dirsave = d.dirSave.addFinalSlash();
		e.referrer = d.refPage.spec;
		// Store this so we can later resume.
		if (!d.is(CANCELED, COMPLETE) && d.partialSize) {
			e.tmpFile = d.tmpFile.path;
		}
		e.startDate = d.startDate.toUTCString();

		e.urlManager = d.urlManager.save();
		e.visitors = d.visitors.save();

		if (!d.isResumable && !d.is(COMPLETE)) {
			e.partialSize = 0;
			e.totalSize = 0;
		} else {
			e.partialSize = d.partialSize;
			e.totalSize = d.totalSize;
		}
		
		e.chunks = [];

		if (!d.is(COMPLETE, CANCELED)) {
			d.chunks.forEach(
				function(c) {
					e.chunks.push({start: c.start, end: c.end, written: c.written});
				}
			);
		}

		var s = this._saveStmt;
		if (d.dbID) {
			s.bindInt64Parameter(0, d.dbID);
		}
		else {
			s.bindNullParameter(0);
		}
		s.bindInt32Parameter(1, pos);
		s.bindUTF8StringParameter(2, this._converter.Convert(e.toSource()));
		s.execute();
		d.dbID = this._con.lastInsertRowID;
	},

	beginUpdate: function() {
		this._con.beginTransactionAs(this._con.TRANSACTION_DEFERRED);		
	},
	endUpdate: function() {
		this._con.commitTransaction();
	},	
	save: function(download) {

		// just one download.
		if (download) {
			this._saveDownload(download);
			return;
		}

		this.beginUpdate();
		try {
			this._con.executeSimpleSQL('DELETE FROM queue');
			var i = 0;
			for (d in tree.all) {
				this._saveDownload(d, i++);
			};
		}
		catch (ex) {
			Debug.dump(ex);
		}
		this.endUpdate();

	},
	deleteDownload: function(download) {
		if (!download.dbID) {
			return;
		}
		this._delStmt.bindInt64Parameter(0, download.dbID);
		this._delStmt.execute();
	},

	load: function() {
		return tree.update(this._load, this);
	},
	_load: function() {

		const removeCompleted = Prefs.removeCompleted;
		const removeCanceled = Prefs.removeCompleted;

		var stmt = this._con.createStatement('SELECT uuid, item FROM queue ORDER BY pos');

		while (stmt.executeStep()) {
			try {
				const dbID = stmt.getInt64(0);
				var down = eval(stmt.getUTF8String(1));
				var get = function(attr) {
					if (attr in down) {
						return down[attr];
					}
					return null;
				}
				if (
					(removeCompleted && down.completed)
					|| (removeCanceled && down.canceled)
				) {
					continue;
				}

				var d = new downloadElement(
					new UrlManager(down.urlManager),
					get("dirsave"),
					get("numIstance"),
					get("description"),
					get("mask"),
					get("referrer"),
					get("tmpFile")
					);
				d.dbID = dbID;
				d.startDate = new Date(get("startDate"));
				d.visitors.load(down.visitors);

				[
					'fileName',
					'destinationName',
					'orginalDirSave',
					'isResumable',
					'state',
					'partialSize',
					'totalSize',
					'alreadyMaskedName',
					'alreadyMaskedDir',
				].forEach(
					function(e) {
						d[e] = get(e);
					}
				);

				d.isStarted = d.partialSize != 0;

				if (d.is(PAUSED)) {
					down.chunks.forEach(
						function(c) {
							d.chunks.push(new Chunk(d, c.start, c.end, c.written));
						}
					);
					d.refreshPartialSize();
					d.status = _('paused');
				}
				else if (d.is(COMPLETE)) {
					d.fileManager = new FileFactory(d.dirSave);
					d.fileManager.append(d.destinationName);
					Stats.completedDownloads++;
					d.isPassed = true;
					d.status = _('completed');
				}
				else if (d.is(CANCELED)) {
					d.isPassed = true;
					d.status = _('canceled');
				}
				
				
				tree.add(d);
				
			}
			catch (ex) {
				Debug.dump('failed to init a download from queuefile', ex);
			}
		}
	}
};