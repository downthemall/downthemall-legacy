module("support/alertservice.js");

test("exports", function() {
	checkExports("support/alertservice", ["available", "show"]);
});

if (require("support/alertservice").available) {
	test("show", function() {
		require("support/alertservice").show("test", "test");
	});
}
else {
	test("show n/a", function() {
		throws(function() require("support/alertservice").show("test", "test"));
	});
}
