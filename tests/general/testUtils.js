module("utils.js");

test("exports", function() {
	checkExports("utils", [
		"MimeQuality",
		"NS_DTA",
		"NS_HTML",
		"NS_XUL",
		"Properties",
		"SimpleIterator",
		"StringBundles",
		"filterInSitu",
		"filterMapInSitu",
		"formatNumber",
		"formatTimeDelta",
		"getTimestamp",
		"hexdigest",
		"launch",
		"makeDir",
		"mapFilterInSitu",
		"mapInSitu",
		"naturalSort",
		"newUUIDString",
		"normalizeMetaPrefs",
		"range",
		"reveal"
		]);
});

test("valid schemes", function() {
	var u = require("utils");
	for (var k in u) {
		if (k.indexOf("NS_") == 0) {
			ok(Services.io.newURI(u[k], null, null), k);
		}
	}
});

test("newUUIDString", function() {
	const {newUUIDString} = require("utils");
	ok(!!newUUIDString(), "set");
	for (var i = 0; i < 10; ++i)
		notEqual(newUUIDString(), newUUIDString(), "different each call");
	ok(/^\{[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\}$/.test(newUUIDString()), "conforms");
});

test("range", function() {
	const {range} = require("utils");

	var r = range(2);
	strictEqual(r.next().value, 0, "0");
	strictEqual(r.next().value, 1, "1");
	strictEqual(r.next().done, true, "stop");

	r = range(1,3);
	strictEqual(r.next().value, 1, "1");
	strictEqual(r.next().value, 2, "2");
	strictEqual(r.next().done, true, "stop");

	r = range(-3,-1,1);
	strictEqual(r.next().value, -3, "-3");
	strictEqual(r.next().value, -2, "-2");
	strictEqual(r.next().done, true, "stop");

	r = range(-30,-10,10);
	strictEqual(r.next().value, -30, "-30");
	strictEqual(r.next().value, -20, "-20");
	strictEqual(r.next().done, true, "stop");

	r = range(-1,-3,-1);
	strictEqual(r.next().value, -1, "-1");
	strictEqual(r.next().value, -2, "-2");
	strictEqual(r.next().done, true, "stop");

	r = range(-10,-30,-10);
	strictEqual(r.next().value, -10, "-10");
	strictEqual(r.next().value, -20, "-20");
	strictEqual(r.next().done, true, "stop");
	

	throws(() => range(1/0).next(), "finite stop");
	throws(() => range(1,1/0).next(), "finite start");
	throws(() => range(1,1,1/0).next(), "finite step");
	throws(() => range(-3,-1,-1).next(), "negative range");
});

test("hexdigest", function() {
	const {hexdigest} = require("utils");
	strictEqual(hexdigest("0123456789abcdef"), "30313233343536373839616263646566");
});

test("formatNumber", function() {
	const {formatNumber} = require("utils");
	strictEqual(formatNumber(-1), "-1", "def; neg");
	strictEqual(formatNumber(1), "001", "def; 1");
	strictEqual(formatNumber(10), "010", "def; 10");
	strictEqual(formatNumber(100), "100", "def; 100");
	strictEqual(formatNumber(1000), "1000", "def; 100");

	strictEqual(formatNumber(-1, 5), "-1", "5; neg");
	strictEqual(formatNumber(1, 5), "00001", "5; 1");
	strictEqual(formatNumber(10, 5), "00010", "5; 10");
	strictEqual(formatNumber(100, 5), "00100", "5; 100");
	strictEqual(formatNumber(1000, 5), "01000", "5; 1000");
	strictEqual(formatNumber(10000, 5), "10000", "5; 10000");
	strictEqual(formatNumber(100000, 5), "100000", "5; 100000");

	strictEqual(formatNumber(-1, 1), "-1", "1; neg");
	strictEqual(formatNumber(1, 1), "1", "1; 1");
	strictEqual(formatNumber(10, 1), "10", "1; 10");
	strictEqual(formatNumber(100, 1), "100", "1; 100");
	strictEqual(formatNumber(1000, 1), "1000", "1; 1000");

	throws(() => formatNumber(1,0), "0 digits");
	throws(() => formatNumber(1,-10), "-10 digits");
});

test("formatTimeDelta", function() {
	const {formatTimeDelta} = require("utils");
	strictEqual(formatTimeDelta(1), "00:01");
	strictEqual(formatTimeDelta(61), "01:01");
	strictEqual(formatTimeDelta(3661), "01:01:01");
	strictEqual(formatTimeDelta(36061), "10:01:01");
	strictEqual(formatTimeDelta(360061), "100:01:01");
});

test("mapInSitu", function() {
	const {mapInSitu} = require("utils");
	var vec = [1,2,3,4];
	deepEqual(mapInSitu(vec, i => i*i), [1,4,9,16]);
	deepEqual(vec, [1,4,9,16]);
});

test("filterInSitu", function() {
	const {filterInSitu} = require("utils");
	var vec = [1,2,3,4,null];
	deepEqual(filterInSitu(vec, i => i % 2), [1,3]);
	deepEqual(vec, [1,3]);
});

test("filterMapInSitu", function() {
	const {filterMapInSitu} = require("utils");
	var vec = [1,2,3,4,null];
	deepEqual(filterMapInSitu(vec, i => i % 2, i => i*i), [1,9]);
	deepEqual(vec, [1,9]);
});

test("mapFilterInSitu", function() {
	const {mapFilterInSitu} = require("utils");
	var vec = [1,2,3,4,null];
	deepEqual(mapFilterInSitu(vec, i => i*2, i => i % 4), [2,6]);
	deepEqual(vec, [2,6]);
});

test("naturalSort", function() {
	const {naturalSort} = require("utils");
	deepEqual(
		naturalSort(["0x01", "0x02", "0xaf", "10x01", "9x01", "-10", "-1", "1", "01", "001", "0001", "0000001", "0000000001", "0000000000001", "000000000000000000001", "01", "0000000000001", "10", "2", "hallow-1", "hallow1", "hallow10", "hallow-10", "hallow2", "hallow-1foo", "hallow1foo", "hallow109xfoo", "hallow109", "hallow109", "hallow109zfoo", "hallow10zfoo", "hallow10foobar", "hallow10foo", "hallow-10foo", "hallow2foo", "bar-1foo", "BAR0foo", "bar1foo", "bar10foo", "bar-10foo", "bar101foo", "bar100foo", "bar200foo", "bar20foo", "bar2foo", "44", "44 (1)", "44 (2)", "44 (3)", "44(4)", "44(5)", "z24", "z2", "z15", "z1", "z3", "z20", "z5", "z11", "z 21", "z22"]),
		["-10", "-1", "1", "01", "01", "001", "0x01", "0001", "0000001", "0000000001", "0000000000001", "0000000000001", "000000000000000000001", "2", "0x02", "9x01", "10", "10x01", "0xaf", "44", "44 (1)", "44 (2)", "44 (3)", "44(4)", "44(5)", "BAR0foo", "bar1foo", "bar-1foo", "bar2foo", "bar10foo", "bar-10foo", "bar20foo", "bar100foo", "bar101foo", "bar200foo", "hallow-10", "hallow-1", "hallow1", "hallow1foo", "hallow-1foo", "hallow2", "hallow2foo", "hallow10", "hallow10foo", "hallow10foobar", "hallow10zfoo", "hallow-10foo", "hallow109", "hallow109", "hallow109xfoo", "hallow109zfoo", "z1", "z2", "z3", "z5", "z11", "z15", "z20", "z 21", "z22", "z24"]
		);
});

test("MimeQuality", function() {
	const {MimeQuality} = require("utils");
	var m = new MimeQuality();
	m.add("a", 0.5);
	m.add("b", 0.1);
	m.add("c", 1.0);
	m.add("x", 0.105);
	m.add("y", 0.100005);
	m.add("z", 0.1005);
	throws(() => m.add("d", 1.1));
	throws(() => m.add("e", -0.1));
	throws(() => m.add("f", -3));
	throws(() => m.add("g", 1 / 0));
	strictEqual(m.toString(), "c,a;q=0.5,x;q=0.105,b;q=0.1,y;q=0.1,z;q=0.1");
})

test("normalizeMetaPrefs", function() {
	const {normalizeMetaPrefs} = require("utils");
	var vec = [{preference: 100}, {preference: 99}, {preference: -3}, {preference: 500}, {preference: 10}];
	normalizeMetaPrefs(vec);
	arrayEqual(vec.map(e => e.preference), [10,100,80,80,97]);
});
