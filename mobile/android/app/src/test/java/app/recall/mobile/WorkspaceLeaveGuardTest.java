package app.recall.mobile;
import org.junit.Test;
import static org.junit.Assert.*;
public class WorkspaceLeaveGuardTest {
    @Test public void onlyCurrentAcknowledgementCanAuthorizeNavigation(){
        WorkspaceLeaveGuard guard=new WorkspaceLeaveGuard();String token=guard.begin();
        assertNull(guard.accept("other-request",0,""));assertTrue(guard.waiting());
        WorkspaceLeaveGuard.Reply reply=guard.accept(token,2,"");assertEquals(2,reply.pending);assertNull(reply.error);
        assertFalse(guard.waiting());assertNull(guard.accept(token,0,""));assertFalse(guard.timeout(token));
    }
    @Test public void malformedOrBusyRepliesNeverAuthorizeNavigation(){
        WorkspaceLeaveGuard guard=new WorkspaceLeaveGuard();String token=guard.begin();
        assertNotNull(guard.accept(token,-1,"").error);
        token=guard.begin();assertEquals("Wait for save",guard.accept(token,0,"Wait for save").error);
        token=guard.begin();assertNotNull(guard.accept(token,10001,"").error);
    }
    @Test public void timeoutCannotCancelANewerRequest(){
        WorkspaceLeaveGuard guard=new WorkspaceLeaveGuard();String old=guard.begin();assertTrue(guard.timeout(old));
        String current=guard.begin();assertFalse(guard.timeout(old));assertTrue(guard.waiting());assertNotNull(guard.accept(current,0,""));
    }
}
