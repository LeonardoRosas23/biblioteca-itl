package mx.edu.itl.biblioteca.prestamos;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@ConfigurationPropertiesScan
public class PrestamosApplication {
    public static void main(String[] args) {
        SpringApplication.run(PrestamosApplication.class, args);
    }
}
