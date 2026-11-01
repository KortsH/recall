package app.recall.mobile;

import java.net.URI;

/** Connection metadata is entered on the device, never embedded in the app. */
public final class ServerAddress {
    public static String normalise(String text) {
        try {
            URI uri = new URI(text.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null || (!uri.getPath().isEmpty() && !"/".equals(uri.getPath()))) throw new IllegalArgumentException();
            if (uri.getPort() == 0 || uri.getPort() > 65535) throw new IllegalArgumentException();
            return new URI("https", null, uri.getHost(), uri.getPort(), "/", null, null).toASCIIString();
        } catch (Exception e) { throw new IllegalArgumentException("Enter only your server’s HTTPS address, including its port if needed."); }
    }
    public static boolean sameOrigin(String configured, String candidate) {
        try { URI a = new URI(configured), b = new URI(candidate); return "https".equalsIgnoreCase(b.getScheme()) && a.getHost().equalsIgnoreCase(b.getHost()) && port(a) == port(b) && b.getRawUserInfo() == null; }
        catch (Exception e) { return false; }
    }
    private static int port(URI uri) { return uri.getPort() == -1 ? 443 : uri.getPort(); }
}
