package mx.edu.itl.biblioteca.prestamos.config;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Configuration
public class ConfiguracionGeneral {

    /** Reloj inyectable: las pruebas lo sustituyen para simular retrasos y vencimientos. */
    @Bean
    public Clock reloj() {
        return Clock.systemUTC();
    }

    @Bean
    public TransactionTemplate transactionTemplate(PlatformTransactionManager tm) {
        return new TransactionTemplate(tm);
    }
}
