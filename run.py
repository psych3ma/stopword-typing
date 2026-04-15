# run.py
import http.server
import socketserver
import webbrowser

PORT = 8000

# 간단한 웹 서버를 엽니다.
Handler = http.server.SimpleHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"웹사이트가 실행되었습니다! 아래 주소를 인터넷 창에 입력하세요.")
    print(f"주소: http://localhost:{PORT}")
    
    # 인터넷 브라우저를 자동으로 띄워줍니다.
    webbrowser.open(f"http://localhost:{PORT}")
    
    # 서버를 계속 켜둡니다. (종료하려면 Ctrl+C)
    httpd.serve_forever()
