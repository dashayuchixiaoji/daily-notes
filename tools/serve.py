# -*- coding: utf-8 -*-
"""日常记事本本地服务：在本机起一个静态服务并自动打开浏览器。

用法：
    python tools/serve.py            启动并打开浏览器
    python tools/serve.py --no-open  只启动服务，不开浏览器（调试用）
"""
import http.server
import os
import socket
import socketserver
import sys
import threading
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)          # 项目根目录
HOST = "127.0.0.1"
PORTS = range(8787, 8801)


def pick_port():
    """依次尝试常用端口，都占用时交给系统分配。"""
    for port in PORTS:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind((HOST, port))
                return port
            except OSError:
                continue
    return 0


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, *args):
        pass  # 保持窗口干净，不打印每条访问日志


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    port = pick_port()
    url = "http://%s:%d/index.html" % (HOST, port)
    with Server((HOST, port), Handler) as httpd:
        port = httpd.server_address[1]
        url = "http://%s:%d/index.html" % (HOST, port)
        line = "=" * 52
        print(line)
        print("  日常记事本已启动")
        print("  地址：%s" % url)
        print("")
        print("  · 使用期间请不要关闭这个窗口")
        print("  · 笔记保存在浏览器里，下次打开依然还在")
        print("  · 用完想关闭：按 Ctrl + C")
        print(line)
        if "--no-open" not in sys.argv:
            threading.Timer(0.6, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n服务已停止。笔记已经保存在浏览器中，不会丢失。")


if __name__ == "__main__":
    main()