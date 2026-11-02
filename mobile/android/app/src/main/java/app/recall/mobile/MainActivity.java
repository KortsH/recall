package app.recall.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

public class MainActivity extends Activity {
    private static final String LOCAL_ORIGIN="https://appassets.androidplatform.net";
    private static final String LOCAL_PAGE=LOCAL_ORIGIN+"/assets/www/index.html";
    private static final int OPEN_JSON=17,SAVE_JSON=18,MAX_FILE=5*1024*1024;
    private WebView web;
    private LinearLayout root;
    private SharedPreferences preferences;
    private ValueCallback<Uri[]> picker;
    private String server,pendingExport;
    private Uri pendingImport;
    private boolean deviceOnly,pageReady;
    private final WorkspaceLeaveGuard leaveGuard=new WorkspaceLeaveGuard();
    private Runnable afterLeave;
    private boolean changingWorkspace;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        preferences=getSharedPreferences("connection",MODE_PRIVATE);
        server=preferences.getString("server","");
        deviceOnly=preferences.getString("mode",server.isEmpty()?"device":"server").equals("device");
        root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.rgb(248,247,244));
        root.setOnApplyWindowInsetsListener((view,insets)->{view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        setContentView(root);
        Uri incoming=importUri(getIntent());
        if(incoming!=null){pendingImport=incoming;chooseDevice();}
        else if(!preferences.contains("mode")&&server.isEmpty())setup();
        else showStudy(saved);
    }
    private Uri importUri(Intent intent){
        if(Intent.ACTION_SEND.equals(intent.getAction())){Uri uri=intent.getParcelableExtra(Intent.EXTRA_STREAM);return uri!=null&&"content".equals(uri.getScheme())?uri:null;}
        Uri uri=Intent.ACTION_VIEW.equals(intent.getAction())?intent.getData():null;return uri!=null&&"content".equals(uri.getScheme())?uri:null;
    }
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);Uri uri=importUri(intent);if(uri!=null){pendingImport=uri;requestLeave(true,()->chooseDevice());}}
    private void requestLeave(boolean switching,Runnable next){
        if(web==null){next.run();return;}
        if(pendingExport!=null||picker!=null){Toast.makeText(this,"Finish the file picker before changing workspaces.",Toast.LENGTH_LONG).show();return;}
        if(leaveGuard.waiting())return;
        changingWorkspace=switching;afterLeave=next;
        final String token=leaveGuard.begin();final WebView current=web;
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('recall-prepare-leave',{detail:"+JSONObject.quote(token)+"}));",null);
        web.postDelayed(()->{
            if(!leaveGuard.timeout(token)||web!=current)return;
            final Runnable action=afterLeave;afterLeave=null;
            new AlertDialog.Builder(this).setTitle("Could not confirm saved state").setMessage("This page may need an update, or a save may still be running. Stored quizzes and submitted offline answers stay at this address. Current unsaved text may be lost if you continue.").setPositiveButton("Keep studying",null).setNegativeButton("Continue anyway",(d,w)->{if(web==current&&action!=null)action.run();}).show();
        },8000);
    }
    private void leaveReply(JSONObject payload){
        WorkspaceLeaveGuard.Reply reply=leaveGuard.accept(payload.optString("token",""),payload.optInt("pending",-1),payload.optString("error",""));
        if(reply==null)return;
        final Runnable action=afterLeave;afterLeave=null;
        if(reply.error!=null){Toast.makeText(this,reply.error,Toast.LENGTH_LONG).show();return;}
        if(action==null)return;
        if(changingWorkspace&&reply.pending>0){
            new AlertDialog.Builder(this).setTitle("Progress is waiting to sync").setMessage(reply.pending+" session(s) still have pending answers. They stay stored at this server address. Return to the same address to sync them; switching does not transfer them to another workspace. You can export a private recovery file in Settings first.").setPositiveButton("Keep studying",null).setNegativeButton("Switch; keep pending",(d,w)->action.run()).setNeutralButton("Open recovery export",(d,w)->web.evaluateJavascript("window.dispatchEvent(new Event('recall-show-recovery'));",null)).show();
        }else action.run();
    }
    private void chooseDevice(){deviceOnly=true;preferences.edit().putString("mode","device").apply();showStudy(null);}
    private void setup(){
        if(web!=null){web.destroy();web=null;}
        root.removeAllViews();
        LinearLayout panel=new LinearLayout(this);panel.setOrientation(LinearLayout.VERTICAL);panel.setPadding(dp(24),dp(30),dp(24),dp(24));root.addView(panel);
        TextView title=new TextView(this);title.setText("Recall");title.setTextSize(34);title.setTextColor(Color.rgb(75,64,85));panel.addView(title);
        TextView copy=new TextView(this);copy.setText("Study on this phone. No server or account needed. Import a quiz file from a friend, learn offline, and export a copy whenever you want.");copy.setTextSize(16);copy.setPadding(0,dp(20),0,dp(20));panel.addView(copy);
        Button local=new Button(this);local.setText("Use without a server");panel.addView(local);local.setOnClickListener(v->chooseDevice());
        TextView optional=new TextView(this);optional.setText("Or connect to your own server for shared progress. Connect your VPN first if your server is private.");optional.setPadding(0,dp(24),0,dp(12));panel.addView(optional);
        EditText address=new EditText(this);address.setSingleLine(true);address.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_URI);address.setHint("https://your-server.example");address.setText(server);panel.addView(address);
        Button connect=new Button(this);connect.setText("Connect to server");panel.addView(connect);
        connect.setOnClickListener(v->{try{server=ServerAddress.normalise(address.getText().toString());deviceOnly=false;preferences.edit().putString("server",server).putString("mode","server").apply();showStudy(null);}catch(IllegalArgumentException e){address.setError(e.getMessage());}});
    }
    private void showStudy(Bundle saved){
        if(web!=null){web.destroy();web=null;}
        pageReady=false;root.removeAllViews();
        Button settings=new Button(this);settings.setText(deviceOnly?"Recall · on this device":"Recall · server connection");settings.setAllCaps(false);root.addView(settings,new LinearLayout.LayoutParams(-1,dp(42)));
        settings.setOnClickListener(v->new AlertDialog.Builder(this).setTitle(deviceOnly?"Device workspace":"Your server").setMessage(deviceOnly?"Quizzes and progress are stored on this phone. Use Export to keep a backup or share a quiz.":server+"\n\nSync pending progress before switching. Device-only and server workspaces stay separate.").setPositiveButton("Keep studying",null).setNeutralButton("Workspace options",(d,w)->requestLeave(true,()->setup())).setNegativeButton("Reload",(d,w)->requestLeave(false,()->web.reload())).show());
        web=new WebView(this);root.addView(web,new LinearLayout.LayoutParams(-1,0,1));
        WebSettings config=web.getSettings();config.setJavaScriptEnabled(true);config.setDomStorageEnabled(true);config.setAllowFileAccess(false);config.setAllowContentAccess(true);config.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);config.setSupportMultipleWindows(false);config.setJavaScriptCanOpenWindowsAutomatically(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);WebView.setWebContentsDebuggingEnabled(false);
        final String origin=deviceOnly?LOCAL_ORIGIN:server;
        final WebViewAssetLoader loader=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                if(!LOCAL_ORIGIN.equals(request.getUrl().getScheme()+"://"+request.getUrl().getHost()))return null;
                WebResourceResponse response=loader.shouldInterceptRequest(request.getUrl());
                if(response==null)return new WebResourceResponse("text/plain","UTF-8",404,"Not found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
                response.setResponseHeaders(Collections.singletonMap("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'self'"));return response;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                String target=request.getUrl().toString();if(ServerAddress.sameOrigin(origin,target))return false;
                if(request.hasGesture()&&"https".equalsIgnoreCase(request.getUrl().getScheme()))try{startActivity(new Intent(Intent.ACTION_VIEW,request.getUrl()));}catch(Exception ignored){}return true;
            }
        });
        if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))WebViewCompat.addWebMessageListener(web,"RecallFiles",Collections.singleton(Uri.parse(origin).buildUpon().path("").build().toString().replaceAll("/$","")),(view,message,sourceOrigin,isMainFrame,reply)->{
            if(view!=web||!isMainFrame||!ServerAddress.sameOrigin(origin,sourceOrigin.toString()))return;
            try{
                JSONObject payload=new JSONObject(message.getData());String action=payload.getString("action");
                if(action.equals("ready")){pageReady=true;receivePending();return;}
                if(action.equals("leave")){leaveReply(payload);return;}
                if(!action.equals("save")||pendingExport!=null)return;
                String content=payload.getString("content");if(content.getBytes(StandardCharsets.UTF_8).length>MAX_FILE)throw new Exception("File exceeds 5 MB");new JSONObject(content);
                String name=payload.optString("name","quiz.recall.json").replaceAll("[^A-Za-z0-9._-]","-");if(name.length()>120)name=name.substring(0,100)+".recall.json";
                pendingExport=content;Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT);save.addCategory(Intent.CATEGORY_OPENABLE);save.setType("application/json");save.putExtra(Intent.EXTRA_TITLE,name);startActivityForResult(save,SAVE_JSON);
            }catch(Exception e){pendingExport=null;Toast.makeText(this,"Could not prepare JSON file: "+e.getMessage(),Toast.LENGTH_LONG).show();}
        });
        web.setWebChromeClient(new WebChromeClient(){@Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
            if(picker!=null)picker.onReceiveValue(null);picker=callback;Intent open=new Intent(Intent.ACTION_OPEN_DOCUMENT);open.addCategory(Intent.CATEGORY_OPENABLE);open.setType("*/*");open.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/json","text/plain","application/octet-stream"});
            try{startActivityForResult(open,OPEN_JSON);return true;}catch(Exception e){picker.onReceiveValue(null);picker=null;return false;}
        }});
        if(saved==null||web.restoreState(saved)==null)web.loadUrl(deviceOnly?LOCAL_PAGE:server);
    }
    private void receivePending(){
        if(!pageReady||!deviceOnly||pendingImport==null)return;
        Uri uri=pendingImport;pendingImport=null;
        try(InputStream input=getContentResolver().openInputStream(uri);ByteArrayOutputStream data=new ByteArrayOutputStream()){
            byte[] buffer=new byte[8192];int n;while((n=input.read(buffer))!=-1){if(data.size()+n>MAX_FILE)throw new Exception("Choose a file under 5 MB");data.write(buffer,0,n);}
            String text=new String(data.toByteArray(),StandardCharsets.UTF_8);
            web.evaluateJavascript("window.dispatchEvent(new CustomEvent('recall-import',{detail:"+JSONObject.quote(text)+"}));",null);
        }catch(Exception e){Toast.makeText(this,"Could not open quiz: "+e.getMessage(),Toast.LENGTH_LONG).show();}
    }
    @Override protected void onSaveInstanceState(Bundle state){super.onSaveInstanceState(state);if(web!=null)web.saveState(state);}
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);
        if(request==OPEN_JSON&&picker!=null){picker.onReceiveValue(result==RESULT_OK&&data!=null&&data.getData()!=null?new Uri[]{data.getData()}:null);picker=null;}
        if(request==SAVE_JSON&&pendingExport!=null){try{if(result==RESULT_OK&&data!=null&&data.getData()!=null)try(OutputStream output=getContentResolver().openOutputStream(data.getData())){output.write(pendingExport.getBytes(StandardCharsets.UTF_8));Toast.makeText(this,"Quiz file saved",Toast.LENGTH_SHORT).show();}}catch(Exception e){Toast.makeText(this,"Could not save quiz file",Toast.LENGTH_LONG).show();}finally{pendingExport=null;}}
    }
    @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){if(picker!=null)picker.onReceiveValue(null);if(web!=null)web.destroy();super.onDestroy();}
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
}
