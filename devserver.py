# Optional local dev server: threaded, big listen backlog and no caching (many small ES-module requests at once).
import http.server, sys
class S(http.server.ThreadingHTTPServer):
    request_queue_size = 256
    daemon_threads = True
class H(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *a): pass
S(('', int(sys.argv[1]) if len(sys.argv) > 1 else 8480), H).serve_forever()
