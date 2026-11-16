(function (runtime) {
    'use strict';
    // Always-on fixes (not tied to any patch setting):
    // - Stream preview thumbnails never refresh in the app because every
    //   channel's preview URL is constant while the image behind it changes
    //   every few minutes, so the native image cache keeps serving the first
    //   frame it ever fetched. Preview URLs get a cache key that rolls over
    //   on the same 5-minute cadence the preview CDN itself uses
    //   (Cache-Control: max-age=300), so visible previews reload fresh art.
    //   The key is applied at every layer that touches the URL: the shared
    //   getStreamThumbnailUrl helper (the home/following feed renders its
    //   result through React Native's own Image, not CoreImage), the
    //   CoreImage component used by some surfaces, and the components that
    //   receive the preview URL as a prop and render it through React
    //   Native's Image themselves (the following list, the skyline
    //   backdrop), whose props are busted at the component boundary.
    // - Chat shows a "reconnecting" snackbar but never confirms recovery.
    //   The connection-state hook is wrapped to post the matching
    //   "reconnected" snackbar when a disconnected episode ends.
    var PREVIEW_BUCKET_MS = 300000;
    function previewBucket(now) { return Math.floor(now / PREVIEW_BUCKET_MS); }
    function bustPreview(url, now) {
        return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + previewBucket(now);
    }
    runtime.target(__TWITCH_THUMBNAIL_URL_MODULE__, 'getStreamThumbnailUrl', function (original) {
        return function () {
            var url = original.apply(this, arguments);
            return typeof url === 'string' && url.indexOf('/previews-ttv/') >= 0 ?
                bustPreview(url, Date.now()) : url;
        };
    });
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
    function bustPreviewProps(original, React) {
        return function (props) {
            var url = props ? props.previewImageURL : null;
            var vertical = props ? props.verticalPreviewImageURL : null;
            var bustUrl = typeof url === 'string' && url.indexOf('/previews-ttv/') >= 0;
            var bustVertical = typeof vertical === 'string' && vertical.indexOf('/previews-ttv/') >= 0;
            var active = bustUrl || bustVertical;
            var setTick = React.useState(0)[1];
            React.useEffect(function () {
                if (!active) return undefined;
                var last = previewBucket(Date.now());
                var timer = setInterval(function () {
                    var next = previewBucket(Date.now());
                    if (next !== last) {
                        last = next;
                        setTick(function (count) { return count + 1; });
                    }
                }, 30000);
                return function () { clearInterval(timer); };
            }, [active, url, vertical]);
            if (!active) return React.createElement(original, props);
            var next = Object.assign({}, props);
            if (bustUrl) next.previewImageURL = bustPreview(url, Date.now());
            if (bustVertical) next.verticalPreviewImageURL = bustPreview(vertical, Date.now());
            return React.createElement(original, next);
        };
    }
    runtime.target(__TWITCH_FOLLOWING_THUMBNAIL_MODULE__, 'FollowingRowThumbnail', bustPreviewProps);
    runtime.target(__TWITCH_SKYLINE_BACKGROUND_MODULE__, 'SkylineThumbnailBackground', bustPreviewProps);
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
