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
import java.util.Locale;
import java.util.HashSet;
import java.util.Set;

public class MainActivity extends Activity {
    private static final String LOCAL_ORIGIN="https://appassets.androidplatform.net";
    private static final String LOCAL_PAGE=LOCAL_ORIGIN+"/assets/www/index.html";
    private static final int OPEN_JSON=17,SAVE_JSON=18,MAX_FILE=5*1024*1024;
    private WebView web;
    private Button workspaceButton;
    private JSONObject messages=new JSONObject(), englishMessages=new JSONObject();
    private final Set<String> languages=new HashSet<>();
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
        try {
            for(String file:getAssets().list("www/locales")) if(file.endsWith(".json")) languages.add(file.substring(0,file.length()-5));
            englishMessages=readMessages("en");
        } catch(Exception ignored) {}
        selectLanguage(preferences.getString("language",Locale.getDefault().toLanguageTag()));
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
        if(pendingExport!=null||picker!=null){Toast.makeText(this,text("native.finishPicker"),Toast.LENGTH_LONG).show();return;}
        if(leaveGuard.waiting())return;
        changingWorkspace=switching;afterLeave=next;
        final String token=leaveGuard.begin();final WebView current=web;
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('recall-prepare-leave',{detail:"+JSONObject.quote(token)+"}));",null);
        web.postDelayed(()->{
            if(!leaveGuard.timeout(token)||web!=current)return;
            final Runnable action=afterLeave;afterLeave=null;
            new AlertDialog.Builder(this).setTitle(text("native.unconfirmedTitle")).setMessage(text("native.unconfirmedBody")).setPositiveButton(text("native.keepStudying"),null).setNegativeButton(text("native.continueAnyway"),(d,w)->{if(web==current&&action!=null)action.run();}).show();
        },8000);
    }
    private void leaveReply(JSONObject payload){
        WorkspaceLeaveGuard.Reply reply=leaveGuard.accept(payload.optString("token",""),payload.optInt("pending",-1),payload.optString("error",""));
        if(reply==null)return;
        final Runnable action=afterLeave;afterLeave=null;
        if(reply.error!=null){Toast.makeText(this,reply.error,Toast.LENGTH_LONG).show();return;}
        if(action==null)return;
        if(changingWorkspace&&reply.pending>0){
            new AlertDialog.Builder(this).setTitle(text("native.pendingTitle")).setMessage(text("native.pendingBody").replace("{{count}}",Integer.toString(reply.pending))).setPositiveButton(text("native.keepStudying"),null).setNegativeButton(text("native.switchPending"),(d,w)->action.run()).setNeutralButton(text("native.openRecovery"),(d,w)->web.evaluateJavascript("window.dispatchEvent(new Event('recall-show-recovery'));",null)).show();
        }else action.run();
    }
    private void chooseDevice(){deviceOnly=true;preferences.edit().putString("mode","device").apply();showStudy(null);}
    private void setup(){
        if(web!=null){web.destroy();web=null;}
        root.removeAllViews();
        LinearLayout panel=new LinearLayout(this);panel.setOrientation(LinearLayout.VERTICAL);panel.setPadding(dp(24),dp(30),dp(24),dp(24));root.addView(panel);
        TextView title=new TextView(this);title.setText("Recall");title.setTextSize(34);title.setTextColor(Color.rgb(75,64,85));panel.addView(title);
        TextView copy=new TextView(this);copy.setText(text("native.setup"));copy.setTextSize(16);copy.setPadding(0,dp(20),0,dp(20));panel.addView(copy);
        Button local=new Button(this);local.setText(text("native.withoutServer"));panel.addView(local);local.setOnClickListener(v->chooseDevice());
        TextView optional=new TextView(this);optional.setText(text("native.optionalServer"));optional.setPadding(0,dp(24),0,dp(12));panel.addView(optional);
        EditText address=new EditText(this);address.setSingleLine(true);address.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_URI);address.setHint(text("native.addressHint"));address.setText(server);panel.addView(address);
        Button connect=new Button(this);connect.setText(text("native.connect"));panel.addView(connect);
        connect.setOnClickListener(v->{try{server=ServerAddress.normalise(address.getText().toString());deviceOnly=false;preferences.edit().putString("server",server).putString("mode","server").apply();showStudy(null);}catch(IllegalArgumentException e){address.setError(text("native.invalidAddress"));}});
    }
    private void showStudy(Bundle saved){
        if(web!=null){web.destroy();web=null;}
        pageReady=false;root.removeAllViews();
        Button settings=new Button(this);workspaceButton=settings;settings.setText(deviceOnly?text("native.deviceBar"):text("native.serverBar"));settings.setAllCaps(false);root.addView(settings,new LinearLayout.LayoutParams(-1,dp(42)));
        settings.setOnClickListener(v->new AlertDialog.Builder(this).setTitle(deviceOnly?text("native.deviceTitle"):text("native.serverTitle")).setMessage(deviceOnly?text("native.deviceDescription"):server+"\n\n"+text("native.serverDescription")).setPositiveButton(text("native.keepStudying"),null).setNeutralButton(text("native.workspaceOptions"),(d,w)->requestLeave(true,()->setup())).setNegativeButton(text("native.reload"),(d,w)->requestLeave(false,()->web.reload())).show());
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
                response.setResponseHeaders(Collections.singletonMap("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://kortsh.github.io; font-src 'self'; base-uri 'self'"));return response;
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
                if(action.equals("appInfo")){
                    JSONObject info=new JSONObject();info.put("platform","android");info.put("version",BuildConfig.VERSION_NAME);
                    web.evaluateJavascript("window.dispatchEvent(new CustomEvent('recall-app-info',{detail:"+info.toString()+"}));",null);return;
                }
                if(action.equals("language")){
                    String language=payload.optString("language","");
                    if(language.length()<=35&&languages.contains(language)){
                        selectLanguage(language);preferences.edit().putString("language",language).apply();
                        if(workspaceButton!=null)workspaceButton.setText(text(deviceOnly?"native.deviceBar":"native.serverBar"));
                    }
                    return;
                }
                if(action.equals("ready")){pageReady=true;receivePending();return;}
                if(action.equals("leave")){leaveReply(payload);return;}
                if(!action.equals("save")||pendingExport!=null)return;
                String content=payload.getString("content");if(content.getBytes(StandardCharsets.UTF_8).length>MAX_FILE)throw new Exception("File exceeds 5 MB");new JSONObject(content);
                String name=payload.optString("name","quiz.recall.json").replaceAll("[^A-Za-z0-9._-]","-");if(name.length()>120)name=name.substring(0,100)+".recall.json";
                pendingExport=content;Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT);save.addCategory(Intent.CATEGORY_OPENABLE);save.setType("application/json");save.putExtra(Intent.EXTRA_TITLE,name);startActivityForResult(save,SAVE_JSON);
            }catch(Exception e){pendingExport=null;Toast.makeText(this,text("native.prepareError"),Toast.LENGTH_LONG).show();}
        });
        web.setWebChromeClient(new WebChromeClient(){@Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
            boolean images=false;for(String accept:params.getAcceptTypes())if(accept!=null&&accept.startsWith("image/"))images=true; if(picker!=null)picker.onReceiveValue(null);picker=callback;Intent open=new Intent(Intent.ACTION_OPEN_DOCUMENT);open.addCategory(Intent.CATEGORY_OPENABLE);open.setType(images?"image/*":"*/*");open.putExtra(Intent.EXTRA_MIME_TYPES,images?new String[]{"image/png","image/jpeg","image/webp"}:new String[]{"application/json","text/plain","application/octet-stream"});
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
        }catch(Exception e){Toast.makeText(this,text("native.openError"),Toast.LENGTH_LONG).show();}
    }
    @Override protected void onResume(){super.onResume();if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('recall-app-resume'));",null);}
    @Override protected void onSaveInstanceState(Bundle state){super.onSaveInstanceState(state);if(web!=null)web.saveState(state);}
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);
        if(request==OPEN_JSON&&picker!=null){picker.onReceiveValue(result==RESULT_OK&&data!=null&&data.getData()!=null?new Uri[]{data.getData()}:null);picker=null;}
        if(request==SAVE_JSON&&pendingExport!=null){try{if(result==RESULT_OK&&data!=null&&data.getData()!=null)try(OutputStream output=getContentResolver().openOutputStream(data.getData())){output.write(pendingExport.getBytes(StandardCharsets.UTF_8));Toast.makeText(this,text("native.saved"),Toast.LENGTH_SHORT).show();}}catch(Exception e){Toast.makeText(this,text("native.saveError"),Toast.LENGTH_LONG).show();}finally{pendingExport=null;}}
    }
    @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){if(picker!=null)picker.onReceiveValue(null);if(web!=null)web.destroy();super.onDestroy();}
    private JSONObject readMessages(String language) throws Exception {
        try(InputStream input=getAssets().open("www/locales/"+language+".json");ByteArrayOutputStream data=new ByteArrayOutputStream()){
            byte[] buffer=new byte[8192];int length;while((length=input.read(buffer))!=-1)data.write(buffer,0,length);
            return new JSONObject(new String(data.toByteArray(),StandardCharsets.UTF_8));
        }
    }
    private void selectLanguage(String requested){
        try{messages=readMessages(InterfaceLanguage.choose(languages,requested));}catch(Exception ignored){messages=englishMessages;}
    }
    private String text(String key){return messages.optString(key,englishMessages.optString(key,key));}
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
}
