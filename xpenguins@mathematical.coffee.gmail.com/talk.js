/* Handles toon speech
 * TODO:
 * - On god mode: each toon goes '!' or voltage symbol
 * - On quit: each toon does a frowny face
 * - On email: show an email symbol (and so on...)
 * - read speeches from theme?
 * - generate random unicode speeches (but all from the same code block/language)
 */
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const St = imports.gi.St;

var Me;
try {
    Me = imports.ui.extensionSystem.extensions['xpenguins@mathematical.coffee.gmail.com'];
} catch (err) {
    Me = imports.misc.extensionUtils.getCurrentExtension().imports;
}
const Toon = Me.toon;
const XPUtil = Me.util;

const SPEECHBUBBLE_TIMEOUT = 1000;

const Arrows = {};
Arrows[Toon.UNASSOCIATED] = '?';
Arrows[Toon.HERE] = '.';
Arrows[Toon.LEFT] = '\u2190';
Arrows[Toon.RIGHT] = '\u2192';
Arrows[Toon.UP] = '\u2191';
Arrows[Toon.DOWN] = '\u2193';
Arrows[Toon.UPLEFT] = '\u2196';
Arrows[Toon.UPRIGHT] = '\u2197';
Arrows[Toon.DOWNLEFT] = '\u2199';
Arrows[Toon.DOWNRIGHT] = '\u2198';

const RandomSpeeches = [
    'º(•♠•)º',
    '╿︡O͟-O︠╿',
    '\u2af7\u00b0\u29ed\u00b0\u2af8', // ⫷ °⧭°⫸
    '\u2603', // ☃
    '\u2665', // ♥
    '\u2699', // ⚘ 
    '\u266B\u266A', // music
    function (toon) { // TODO: check renderable...
        let length = XPUtil.RandInt(3) + 1,
            speech = [];
        while (length--) {
            speech.push(XPUtil.RandIntRange(32, 65535));
        }
        speech = String.fromCharCode.apply('', speech);
        // log(speech);
        // BIG TODO: utf8 character can't be converted -- avoid these ones.
        return speech;
    }
];
const Speeches = {
    walker: {
        initial: function (toon) { return Arrows[toon.direction] }
    },

    runner: {
        initial: function (toon) {
            switch (toon.direction) {
                case LEFT:
                    return '\u219e';
                    break;
                case UP: 
                    return '\u219F';
                    break;
                case RIGHT: 
                    return '\u21a0';
                    break;
                case LEFT: 
                    return '\u21a1';
                    break;
                default:
                    return '';
                    break;
            }
        }
    },
    
    faller: {
        initial: '\u26A0', // ⚠
        during: [
            '\u2602', // ☂
            '\u203c', // !!
            '\u2708'  // ✈
        ]
    },
    
    tumbler: {
        initial: '\u203c', // !!
        during: [
            '\u2047', // ??
            '\u2602' // ☂
        ]
    },

    floater: {
        initial: '\ufffd', // �
        during: [
            '\u2602' // ☂
        ]
    },


    climber: {
        initial: '\u21E7' // ⇧
    },

    explosion: {
        initial: '\u2639', // :(
        during: [
            '\u2620', // ☠
            '\u2522', // ☢
            '\u2623'  // ☣
        ]
    },

    zapped: {
        initial: '\u26A1'
    },
    
    squashed: {
    },

    splatted: {
        initial: 'ow!'
    },

    angel: {
        initial: '',
        during: [ // TODO: string these together randomly?
            '\u2669', // crotchet
            '\u266A', // quaver
            '\u266B', // beamed quavers
            '\u266C', // beamed sixteenths
            '\u266C' 
        ]
    }
};

function SpeechBubble() {
    this._init.apply(this, arguments);
}

SpeechBubble.prototype = {
    _init: function (toon) {
        this.toon = toon;
        this._timeoutId = 0;
        this.actor = new St.Label({
            style_class: 'speech-bubble'
        });
        this.actor._delegate = this;

        /* add to stage */
        global.stage.add_actor(this.actor);

        /* bind to the toon's position: can't set unequal offsets in each direction? */
        this.constrainX = new Clutter.BindConstraint({
            source: toon.actor,
            coordinate: Clutter.BindCoordinate.X
        });

        this.constrainY = new Clutter.BindConstraint({
            source: toon.actor,
            coordinate: Clutter.BindCoordinate.Y,
            offset: 0
        });
        this.actor.add_constraint(this.constrainX);
        this.actor.add_constraint(this.constrainY);
    },

    show: function (message) {
        if (this._timeoutId) {
            Mainloop.source_remove(this._timeoutId);
        }
        this.actor.text = message; // bummer!

        // position speech bubble so it trails them...
        let xoff = this.toon.data.width/2;
        switch(this.toon.direction) {
            case Toon.DOWNLEFT:
            case Toon.UPLEFT:
            case Toon.LEFT:
                xoff *= 1.8; // .9 * this.toon.data.width
                break;
            case Toon.DOWNRIGHT:
            case Toon.UPRIGHT:
            case Toon.RIGHT:
                xoff = -this.actor.width*.9;
        }
        // TODO: how to check this is fully allocated (width, height)
        this.constrainY.set_offset(-this.actor.height);
        this.constrainX.set_offset(xoff);
        this._timeoutId = Mainloop.timeout_add(SPEECHBUBBLE_TIMEOUT,
            Lang.bind(this, function () {
                this.actor.hide();
                this._timeoutId = 0;
                return false;
            }));
        this.actor.show();
        // TODO: a line or bubbles connecting the speech bubble to the toon
    },

    /* a call to hide will hide immediately, cancelling any timeout */
    hide: function () {
        if (this._timeoutId) {
            Mainloop.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        this.actor.hide();
    },

    destroy: function () {
        // remove any timeouts
        this.hide();
        // destroy (which removes from stage)
        this.actor.destroy();
    }
};
