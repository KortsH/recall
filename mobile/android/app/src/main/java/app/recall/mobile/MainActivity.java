package app.recall.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
    private WebView web;
    private LinearLayout root;
    private SharedPreferences preferences;
    private ValueCallback<Uri[]> picker;
    private String server;
    private static final int FILE_PICKER = 17;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        preferences = getSharedPreferences("connection", MODE_PRIVATE);
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.rgb(248,247,244));
        root.setOnApplyWindowInsetsListener((view, insets) -> { view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom()); return insets; });
        setContentView(root);
        server = preferences.getString("server", "");
        if (server.isEmpty()) setup(); else showStudy(saved);
    }

    private void setup() {
        if (web != null) { web.destroy(); web = null; }
        root.removeAllViews();
        LinearLayout panel = new LinearLayout(this); panel.setOrientation(LinearLayout.VERTICAL); panel.setPadding(dp(24),dp(40),dp(24),dp(24)); root.addView(panel);
        TextView title = new TextView(this); title.setText("Recall"); title.setTextSize(34); title.setTextColor(Color.rgb(75,64,85)); panel.addView(title);
        TextView copy = new TextView(this); copy.setText("Connect to your own Recall server. Your address stays on this device.\n\nFor a private server, connect your VPN first. Downloaded study mode is available inside Recall."); copy.setTextSize(16); copy.setPadding(0,dp(20),0,dp(24)); panel.addView(copy);
        EditText address = new EditText(this); address.setSingleLine(true); address.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI); address.setHint("https://your-server.example"); address.setText(server); panel.addView(address);
        Button connect = new Button(this); connect.setText("Connect to Recall"); panel.addView(connect);
        connect.setOnClickListener(v -> { try { server = ServerAddress.normalise(address.getText().toString()); preferences.edit().putString("server",server).apply(); showStudy(null); } catch (IllegalArgumentException e) { address.setError(e.getMessage()); } });
    }

    private void showStudy(Bundle saved) {
        root.removeAllViews();
        Button settings = new Button(this); settings.setText("Recall · connection"); settings.setAllCaps(false); root.addView(settings,new LinearLayout.LayoutParams(-1,dp(42)));
        settings.setOnClickListener(v -> new AlertDialog.Builder(this).setTitle("Your server").setMessage(server+"\n\nSync pending study progress before switching servers. Local downloaded data stays scoped to its server address.").setPositiveButton("Keep studying",null).setNeutralButton("Change server",(d,w)->setup()).setNegativeButton("Reload",(d,w)->web.reload()).show());
        web = new WebView(this); root.addView(web,new LinearLayout.LayoutParams(-1,0,1));
        WebSettings config=web.getSettings(); config.setJavaScriptEnabled(true); config.setDomStorageEnabled(true); config.setCacheMode(WebSettings.LOAD_DEFAULT); config.setAllowFileAccess(false); config.setAllowContentAccess(true); config.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); config.setSupportMultipleWindows(false); config.setJavaScriptCanOpenWindowsAutomatically(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        WebView.setWebContentsDebuggingEnabled(false);
        web.setWebViewClient(new WebViewClient(){ @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) {
            String target=request.getUrl().toString(); if(ServerAddress.sameOrigin(server,target)) return false;
            if(request.hasGesture()&&"https".equalsIgnoreCase(request.getUrl().getScheme())) { try { startActivity(new Intent(Intent.ACTION_VIEW,request.getUrl())); } catch(Exception ignored){} } return true;
        }});
        web.setWebChromeClient(new WebChromeClient(){ @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params) {
            if(picker!=null)picker.onReceiveValue(null);picker=callback;
            Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("application/json");
            try {startActivityForResult(intent,FILE_PICKER);return true;}catch(Exception error){picker.onReceiveValue(null);picker=null;return false;}
        }});
        if(saved==null||web.restoreState(saved)==null)web.loadUrl(server);
    }
    @Override protected void onSaveInstanceState(Bundle state){super.onSaveInstanceState(state);if(web!=null)web.saveState(state);}
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==FILE_PICKER&&picker!=null){picker.onReceiveValue(result==RESULT_OK&&data!=null&&data.getData()!=null?new Uri[]{data.getData()}:null);picker=null;}}
    @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){if(picker!=null){picker.onReceiveValue(null);picker=null;}if(web!=null){web.destroy();web=null;}super.onDestroy();}
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
}
