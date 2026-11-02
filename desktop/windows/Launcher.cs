using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal static class RecallLauncher {
    const string Version="0.8.1-preview.1";
    static TcpListener listener;
    static Control dispatch;
    static NotifyIcon tray;
    static string root,webRoot,token,instance;
    static int port;
    static bool stopping;
    [STAThread] static void Main(string[] args) {
        try {
            root=Path.GetFullPath(Option(args,"--data-dir",Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"RecallPersonal")));
            port=int.Parse(Option(args,"--port","4312"));if(port<1024||port>65535)throw new Exception("Invalid local port");
            bool owned;using(var mutex=new Mutex(true,"Local\\RecallPersonal-"+port,out owned)) {
                if(!owned){if(IsRecall(port)){if(Array.IndexOf(args,"--no-browser")<0)OpenBrowser();return;}throw new Exception("Another Recall instance is starting. Try again shortly.");}
                Directory.CreateDirectory(root);webRoot=ExtractWeb();
                listener=new TcpListener(IPAddress.Loopback,port);listener.Start();
                byte[] bytes=new byte[32];using(var random=RandomNumberGenerator.Create())random.GetBytes(bytes);token=Convert.ToBase64String(bytes);
                instance=Path.Combine(root,"instance.txt");File.WriteAllLines(instance,new[]{port.ToString(),token,Process.GetCurrentProcess().Id.ToString()});
                dispatch=new Control();var handle=dispatch.Handle;
                Application.ApplicationExit+=(s,e)=>{stopping=true;listener.Stop();if(tray!=null)tray.Dispose();try{File.Delete(instance);}catch{}};
                ThreadPool.QueueUserWorkItem(_=>Accept());
                if(Array.IndexOf(args,"--no-tray")<0){tray=new NotifyIcon{Icon=SystemIcons.Application,Text="Recall — on this device",Visible=true};var menu=new ContextMenuStrip();menu.Items.Add("Open Recall",null,(s,e)=>OpenBrowser());menu.Items.Add("Quit Recall",null,(s,e)=>Application.Exit());tray.ContextMenuStrip=menu;tray.DoubleClick+=(s,e)=>OpenBrowser();}
                if(Array.IndexOf(args,"--no-browser")<0)OpenBrowser();
                Application.Run();mutex.ReleaseMutex();
            }
        }catch(Exception e){Environment.ExitCode=1;if(Array.IndexOf(args,"--quiet")<0)MessageBox.Show("Recall could not start. "+e.Message,"Recall",MessageBoxButtons.OK,MessageBoxIcon.Error);}
    }
    static string Option(string[] args,string key,string fallback){int i=Array.IndexOf(args,key);return i>=0&&i+1<args.Length?args[i+1]:fallback;}
    static void OpenBrowser(){Process.Start(new ProcessStartInfo("http://127.0.0.1:"+port+"/"){UseShellExecute=true});}
    static bool IsRecall(int number){try{var request=(HttpWebRequest)WebRequest.Create("http://127.0.0.1:"+number+"/__recall/health");request.Timeout=2000;using(var response=request.GetResponse())using(var reader=new StreamReader(response.GetResponseStream()))return reader.ReadToEnd().Contains("RecallPersonal");}catch{return false;}}
    static string ExtractWeb(){
        byte[] zip;using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("recall.web.zip"))using(var data=new MemoryStream()){stream.CopyTo(data);zip=data.ToArray();}
        string hash;using(var sha=SHA256.Create())hash=BitConverter.ToString(sha.ComputeHash(zip)).Replace("-","").Substring(0,16);
        string target=Path.Combine(root,"web",hash);string marker=Path.Combine(target,".complete");if(File.Exists(marker))return target;
        Directory.CreateDirectory(target);string prefix=Path.GetFullPath(target)+Path.DirectorySeparatorChar;
        using(var memory=new MemoryStream(zip))using(var archive=new ZipArchive(memory,ZipArchiveMode.Read))foreach(var entry in archive.Entries){
            string path=Path.GetFullPath(Path.Combine(target,entry.FullName.Replace('/',Path.DirectorySeparatorChar)));
            if(!path.StartsWith(prefix,StringComparison.OrdinalIgnoreCase))throw new Exception("Invalid application archive path");
            if(entry.FullName.EndsWith("/")){Directory.CreateDirectory(path);continue;}
            Directory.CreateDirectory(Path.GetDirectoryName(path));using(var input=entry.Open())using(var output=File.Create(path))input.CopyTo(output);
        }
        File.WriteAllText(marker,Version);return target;
    }
    static void Accept(){while(!stopping)try{var client=listener.AcceptTcpClient();ThreadPool.QueueUserWorkItem(_=>Serve(client));}catch{if(!stopping)Thread.Sleep(50);}}
    static void Serve(TcpClient client){using(client)try{
        client.ReceiveTimeout=3000;client.SendTimeout=3000;using(var stream=client.GetStream()){
            var reader=new StreamReader(stream,Encoding.ASCII,false,4096,true);string first=reader.ReadLine();if(first==null||first.Length>4096)return;
            string[] line=first.Split(' ');if(line.Length!=3){Reply(stream,400,"Bad request",null,false);return;}
            var headers=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);string header;int size=first.Length;
            while(!String.IsNullOrEmpty(header=reader.ReadLine())){size+=header.Length;if(size>16384)return;int at=header.IndexOf(':');if(at>0)headers[header.Substring(0,at).Trim()]=header.Substring(at+1).Trim();}
            string host;headers.TryGetValue("Host",out host);if(host!="127.0.0.1:"+port&&host!="localhost:"+port){Reply(stream,403,"Host not allowed",null,false);return;}
            if(line[1]=="/__recall/health"){Reply(stream,200,"{\"app\":\"RecallPersonal\",\"version\":\""+Version+"\"}","application/json",line[0]=="HEAD");return;}
            if(line[1]=="/__recall/stop"){
                string supplied,origin;headers.TryGetValue("X-Recall-Token",out supplied);headers.TryGetValue("Origin",out origin);
                if(line[0]!="POST"||supplied!=token||origin!=null){Reply(stream,403,"Not allowed",null,false);return;}
                Reply(stream,200,"Stopping",null,false);dispatch.BeginInvoke((Action)(()=>Application.Exit()));return;
            }
            if(line[0]!="GET"&&line[0]!="HEAD"){Reply(stream,405,"Method not allowed",null,false);return;}
            if(!line[1].StartsWith("/")||line[1].StartsWith("//")){Reply(stream,400,"Invalid path",null,false);return;}
            string relative=Uri.UnescapeDataString(line[1].Split('?')[0]).TrimStart('/');if(relative=="")relative="index.html";
            string path=Path.GetFullPath(Path.Combine(webRoot,relative.Replace('/',Path.DirectorySeparatorChar)));
            if(!path.StartsWith(Path.GetFullPath(webRoot)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||relative.Contains("\\")){Reply(stream,403,"Path not allowed",null,false);return;}
            string mime=Mime(Path.GetExtension(path));if(mime==null||!File.Exists(path)){Reply(stream,404,"Not found",null,false);return;}
            byte[] data=File.ReadAllBytes(path);ReplyBytes(stream,200,data,mime,line[0]=="HEAD");
        }
    }catch{}}
    static string Mime(string extension){switch(extension.ToLowerInvariant()){case ".txt":return "text/plain; charset=utf-8";case ".html":return "text/html; charset=utf-8";case ".js":return "text/javascript; charset=utf-8";case ".css":return "text/css; charset=utf-8";case ".json":case ".webmanifest":return "application/json";case ".svg":return "image/svg+xml";case ".png":return "image/png";case ".ico":return "image/x-icon";case ".woff":return "font/woff";case ".woff2":return "font/woff2";default:return null;}}
    static void Reply(Stream stream,int status,string text,string mime,bool head){ReplyBytes(stream,status,Encoding.UTF8.GetBytes(text),mime??"text/plain; charset=utf-8",head);}
    static void ReplyBytes(Stream stream,int status,byte[] data,string mime,bool head){
        string header="HTTP/1.1 "+status+" "+(status==200?"OK":"Error")+"\r\nContent-Type: "+mime+"\r\nContent-Length: "+data.Length+"\r\nConnection: close\r\nCache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nX-Frame-Options: DENY\r\nContent-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://kortsh.github.io; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'\r\n\r\n";
        byte[] bytes=Encoding.ASCII.GetBytes(header);stream.Write(bytes,0,bytes.Length);if(!head)stream.Write(data,0,data.Length);
    }
}
