package artofreacting.api;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

class InMemoryUserRepositoryTest {

    private final InMemoryUserRepository repository = new InMemoryUserRepository();

    @Test
    void saveIfAbsent_returnsTrueForNewUsername() {
        User user = user("alice");
        assertThat(repository.saveIfAbsent(user)).isTrue();
        assertThat(repository.findAll()).containsExactly(user);
    }

    @Test
    void saveIfAbsent_returnsFalseForDuplicateUsername() {
        repository.saveIfAbsent(user("alice"));

        assertThat(repository.saveIfAbsent(user("alice"))).isFalse();
        assertThat(repository.findAll()).hasSize(1);
    }

    @Test
    void saveIfAbsent_treatsUsernamesAsCaseInsensitive() {
        repository.saveIfAbsent(user("Dejan"));

        assertThat(repository.saveIfAbsent(user("DEJAN"))).isFalse();
        assertThat(repository.saveIfAbsent(user("dejan"))).isFalse();
        assertThat(repository.findAll()).hasSize(1);
    }

    @Test
    void saveIfAbsent_preservesOriginalCasing() {
        repository.saveIfAbsent(user("Dejan"));

        assertThat(repository.findAll())
                .extracting(User::username)
                .containsExactly("Dejan");
    }

    @Test
    void findAll_returnsAllRegisteredUsers() {
        repository.saveIfAbsent(user("alice"));
        repository.saveIfAbsent(user("bob"));
        repository.saveIfAbsent(user("carol"));

        assertThat(repository.findAll())
                .extracting(User::username)
                .containsExactlyInAnyOrder("alice", "bob", "carol");
    }

    @Test
    void findAll_returnsImmutableSnapshot() {
        repository.saveIfAbsent(user("alice"));
        List<User> snapshot = repository.findAll();

        assertThat(snapshot).isUnmodifiable();
    }

    @Test
    void saveIfAbsent_isAtomicUnderConcurrentRegistrations() throws InterruptedException {
        int threadCount = 64;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(threadCount);
        AtomicInteger successes = new AtomicInteger();

        try {
            for (int i = 0; i < threadCount; i++) {
                executor.submit(() -> {
                    try {
                        start.await();
                        if (repository.saveIfAbsent(user("racy"))) {
                            successes.incrementAndGet();
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    } finally {
                        done.countDown();
                    }
                });
            }

            start.countDown();
            assertThat(done.await(5, TimeUnit.SECONDS)).isTrue();
        } finally {
            executor.shutdownNow();
        }

        assertThat(successes.get()).isEqualTo(1);
        assertThat(repository.findAll()).hasSize(1);
    }

    private static User user(String username) {
        return new User(UUID.randomUUID(), username, Instant.now());
    }
}
