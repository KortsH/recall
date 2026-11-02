package app.recall.mobile;

import java.util.UUID;

/** Bind a save acknowledgement to exactly one native navigation request. */
public final class WorkspaceLeaveGuard {
    private String token;
    public boolean waiting() { return token != null; }
    public String begin() {
        if (waiting()) throw new IllegalStateException("A workspace change is already pending");
        token = UUID.randomUUID().toString(); return token;
    }
    public Reply accept(String candidate, int pending, String error) {
        if (token == null || !token.equals(candidate)) return null;
        token = null;
        if (error != null && !error.isEmpty()) return new Reply(0, error);
        if (pending < 0 || pending > 10000) return new Reply(0, "The page did not confirm its saved progress.");
        return new Reply(pending, null);
    }
    public boolean timeout(String candidate) {
        if (token == null || !token.equals(candidate)) return false;
        token = null; return true;
    }
    public static final class Reply {
        public final int pending; public final String error;
        Reply(int pending, String error) { this.pending = pending; this.error = error; }
    }
}
