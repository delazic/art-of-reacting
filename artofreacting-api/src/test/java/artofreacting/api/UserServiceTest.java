package artofreacting.api;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    UserRepository repository;

    @InjectMocks
    UserService service;

    @Test
    void register_returnsUserWithGeneratedIdAndTimestampAndProvidedUsername() {
        when(repository.saveIfAbsent(any(User.class))).thenReturn(true);
        Instant before = Instant.now();

        User user = service.register("alice");

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(repository).saveIfAbsent(captor.capture());

        assertThat(user).isEqualTo(captor.getValue());
        assertThat(user.id()).isNotNull();
        assertThat(user.username()).isEqualTo("alice");
        assertThat(user.createdAt())
                .isBetween(before.minusSeconds(1), Instant.now().plusSeconds(1))
                .isCloseTo(Instant.now(), within(5, ChronoUnit.SECONDS));
    }

    @Test
    void register_throwsWhenRepositoryReportsDuplicate() {
        when(repository.saveIfAbsent(any(User.class))).thenReturn(false);

        assertThatThrownBy(() -> service.register("alice"))
                .isInstanceOf(UsernameAlreadyExistsException.class);
    }

    @Test
    void list_delegatesToRepository() {
        User alice = new User(UUID.randomUUID(), "alice", Instant.now());
        when(repository.findAll()).thenReturn(List.of(alice));

        assertThat(service.list()).containsExactly(alice);
        verify(repository).findAll();
    }
}
