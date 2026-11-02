using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Windows.Forms;

internal static class RecallSetup {
    const string Version="0.8.1-preview.1";
    [STAThread] static void Main(string[] args){try{
        string root=Path.GetFullPath(Option(args,"--install-dir",Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"RecallPersonal")));
        string folder=Path.Combine(root,"versions",Version);Directory.CreateDirectory(folder);
        string executable=Path.Combine(folder,"Recall.exe");byte[] payload;
        using(var source=Assembly.GetExecutingAssembly().GetManifestResourceStream("Recall.exe"))using(var data=new MemoryStream()){source.CopyTo(data);payload=data.ToArray();}
        if(!File.Exists(executable)||Hash(File.ReadAllBytes(executable))!=Hash(payload)){
            StopExisting(root);string temporary=executable+".new";File.WriteAllBytes(temporary,payload);
            if(File.Exists(executable))File.Delete(executable);File.Move(temporary,executable);
        }
        if(Array.IndexOf(args,"--no-shortcut")<0){
            string shortcuts=Path.GetFullPath(Option(args,"--shortcut-dir",Environment.GetFolderPath(Environment.SpecialFolder.Programs)));Directory.CreateDirectory(shortcuts);
            string shortcut=Path.Combine(shortcuts,"Recall.lnk");
            Type shellType=Type.GetTypeFromProgID("WScript.Shell");object shell=Activator.CreateInstance(shellType);
            object link=shellType.InvokeMember("CreateShortcut",BindingFlags.InvokeMethod,null,shell,new object[]{shortcut});Type type=link.GetType();
            type.InvokeMember("TargetPath",BindingFlags.SetProperty,null,link,new object[]{executable});
            type.InvokeMember("Arguments",BindingFlags.SetProperty,null,link,new object[]{"--data-dir \""+root+"\""});
            type.InvokeMember("Description",BindingFlags.SetProperty,null,link,new object[]{"Recall — learn offline and share quiz files"});
            type.InvokeMember("Save",BindingFlags.InvokeMethod,null,link,null);
        }
        File.WriteAllText(Path.Combine(root,"INSTALL.txt"),"Recall "+Version+"\r\nStart from the Recall shortcut. Your quizzes and progress are stored in your browser profile at http://127.0.0.1:4312/. Export quiz files before clearing browser data.\r\nTo remove the app, quit Recall from its tray icon, remove its Start-menu shortcut and this installation folder. This does not clear browser study data.\r\n");
        if(Array.IndexOf(args,"--no-launch")<0)Process.Start(new ProcessStartInfo(executable,"--data-dir \""+root+"\""){UseShellExecute=true});
    }catch(Exception e){Environment.ExitCode=1;if(Array.IndexOf(args,"--quiet")<0)MessageBox.Show("Recall installation could not finish. "+e.Message,"Recall Setup",MessageBoxButtons.OK,MessageBoxIcon.Error);}}
    static string Option(string[] args,string key,string fallback){int i=Array.IndexOf(args,key);return i>=0&&i+1<args.Length?args[i+1]:fallback;}
    static string Hash(byte[] bytes){using(var sha=SHA256.Create())return Convert.ToBase64String(sha.ComputeHash(bytes));}
    static void StopExisting(string root){
        string state=Path.Combine(root,"instance.txt");if(!File.Exists(state))return;
        string[] parts=File.ReadAllLines(state);if(parts.Length<2)return;
        try{var request=(HttpWebRequest)WebRequest.Create("http://127.0.0.1:"+int.Parse(parts[0])+"/__recall/stop");request.Method="POST";request.Headers["X-Recall-Token"]=parts[1];request.ContentLength=0;request.Timeout=3000;using(var response=request.GetResponse()){}System.Threading.Thread.Sleep(300);}catch(WebException){throw new Exception("Quit the running Recall app and run setup again. Your study data is preserved.");}
    }
}
