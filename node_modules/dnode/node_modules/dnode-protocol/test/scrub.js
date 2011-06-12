var assert = require('assert');
var Scrubber = require('dnode-protocol').Scrubber;

exports.noFuncs = function () {
    var s = new Scrubber;
    assert.eql(
        s.scrub([ 1, 2, 3 ]),
        {
            arguments : [ 1, 2, 3 ],
            callbacks : [],
            links : [],
        }
    );
    
    assert.eql(
        s.scrub([ 4, { a : 5, b : 6 } ]),
        {
            arguments : [ 4, { a : 5, b : 6 } ],
            callbacks : [],
            links : [],
        }
    );
};

exports.funcs = function () {
    var s = new Scrubber;
    
    var calls = { f : 0, g : 0 };
    var f = function () { calls.f ++ };
    var g = function () { calls.g ++ };
    
    var sc = s.scrub([ 1, 2, f, g ]);
    assert.eql(sc, {
        arguments : [ 1, 2, '[Function]', '[Function]' ],
        callbacks : { 0 : [ '2' ], 1 : [ '3' ] },
        links : [],
    });
    
    s.callbacks[0]();
    assert.eql(calls, { f : 1, g : 0 });
    
    s.callbacks[1]();
    assert.eql(calls, { f : 1, g : 1 });
};

exports.link = function () {
    var s = new Scrubber;
    var x = [ [ 0, { a : 1, b : 2, c : 3 }, 4 ], 5, 6 ];
    x[0][1].d = x[0][1];
    var sc = s.scrub(x);
    
    assert.eql(sc, {
        arguments : [
            [ 0, { a : 1, b : 2, c : 3, d : '[Circular]' }, 4 ], 5, 6
        ],
        callbacks : {},
        links : [ { from : [ '0', '1'  ], to : [ '0', '1', 'd' ] } ],
    });
};

exports.multilink = function () {
    var s = new Scrubber;
    var x = [ [ 0, { a : 1, b : 2, c : 3 }, 4 ], 5, 6 ];
    x[0][1].d = x[0][1];
    x.push(x);
    var sc = s.scrub(x);
    
    assert.eql(sc, {
        arguments : [
            [ 0, { a : 1, b : 2, c : 3, d : '[Circular]' }, 4 ],
            5, 6, '[Circular]'
        ],
        callbacks : {},
        links : [
            { from : [ '0', '1'  ], to : [ '0', '1', 'd' ] },
            { from : [], to : [ '3' ] },
        ],
    });
};
