(function (runtime) {
    'use strict';
    // Always-on fixes (not tied to any patch setting):
    // - Stream preview thumbnails never refresh in the app because every
    //   channel's preview URL is constant while the image behind it changes
    //   every few minutes, so the native image cache keeps serving the first
    //   frame it ever fetched. Preview URLs get a cache key that rolls over
    //   on the same 5-minute cadence the preview CDN itself uses
    //   (Cache-Control: max-age=300), so visible previews reload fresh art.
    // - Chat shows a "reconnecting" snackbar but never confirms recovery.
    //   The connection-state hook is wrapped to post the matching
    //   "reconnected" snackbar when a disconnected episode ends.
    var PREVIEW_BUCKET_MS = 300000;
    function previewBucket(now) { return Math.floor(now / PREVIEW_BUCKET_MS); }
    function bustPreview(url, now) {
        return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + previewBucket(now);
    }
    runtime.target(__TWITCH_CORE_IMAGE_MODULE__, 'CoreImage', function (original, React) {
        return function (props) {
            var src = props ? props.src : null;
            var uri = typeof src === 'string' ? src :
                (src && typeof src.uri === 'string' ? src.uri : null);
            var preview = !!uri && uri.indexOf('/previews-ttv/') >= 0;
            var setTick = React.useState(0)[1];
            React.useEffect(function () {
                if (!preview) return undefined;
                var last = previewBucket(Date.now());
                var timer = setInterval(function () {
                    var next = previewBucket(Date.now());
                    if (next !== last) {
                        last = next;
                        setTick(function (count) { return count + 1; });
                    }
                }, 30000);
                return function () { clearInterval(timer); };
            }, [preview, uri]);
            if (!preview) return React.createElement(original, props);
            var busted = bustPreview(uri, Date.now());
            var nextSrc = typeof src === 'string' ? busted :
                Object.assign({}, src, {uri: busted});
            return React.createElement(original, Object.assign({}, props, {src: nextSrc}));
        };
    });
    runtime.target(__TWITCH_CHAT_CONNECTION_MODULE__, 'useChatConnectionState', function (original, React, runtime, require) {
        var useSnackbar = require(__TWITCH_SNACKBAR_MODULE__).useSnackbar;
        return function () {
            var state = original.apply(this, arguments);
            var snackbar = useSnackbar();
            var seen = React.useRef(null);
            var addSnackbar = snackbar ? snackbar.addSnackbar : null;
            var connected = state ? state.connected : undefined;
            React.useEffect(function () {
                var was = seen.current;
                seen.current = connected;
                if (was === false && connected === true && typeof addSnackbar === 'function')
                    addSnackbar({message: 'チャットに再接続しました', type: 'info', fullWidth: true, duration: 3000});
            }, [connected, addSnackbar]);
            return state;
        };
    });
})(globalThis.__twitchPatchRuntime);
