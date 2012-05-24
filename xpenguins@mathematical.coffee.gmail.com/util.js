/* Get the 1-min averaged system load on linux systems - it's the
 * first number in the /proc/loadavg pseudofile. Return -1 if not
 * found. */
function loadAverage() {};
try {
    const GTop = imports.gi.Gtop;
    loadAverage = function() {
        let loadavg = new GTop.glibtop_loadavg;
        GTop.glibtop_get_loadavg(loadavg);
        return loadavg.loadavg[0];
    };
} catch (err) {
    loadAverage = function() {
        let load=-1;
        try {
            let str = Shell.get_file_contents_utf8_sync('/proc/loadavg');
            load = parseFloat(str.split(' ')[0]);
        } catch(err) {
            load = -1;
        }
        return load;
    };
}; // <-- test!

function removeDuplicates(arr) {
    let i=0, out=[], obj={};
    for ( i=0; i<arr.length; ++i ) {
        obj[arr[i]]=0;
    }
    for ( i in obj ) {
        out.push(i);
    }
    return out;
};

/* random int from 0 to (max-1) */
function RandInt(max) {
    return Math.floor( Math.random()*max );
}

