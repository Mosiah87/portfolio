import React, { useState } from "react";
import { useNavigate } from "react-router";
import "bootstrap/dist/css/bootstrap.css";
 
let insertedId;

export default function Name() {
    const navigate = useNavigate();

    const [name, setName] = useState({
        name: "",
    });
    
    const handleChange = event => {
        setName({ name: event.target.value });
    };

    async function onSubmit(e){
        e.preventDefault();

        if(!name.name) {
            window.alert("Please enter a name before continuing")
        }
        else {
            await fetch("http://localhost:5000/scores/add", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(name),
            })
            .then(response => response.json())
            .then(data => {
                insertedId = data.insertedId;
                setName({ name: "" });
                navigate(`/game/${insertedId}`);
            })
            .catch(error => {
                window.alert(error);
                return;
            });

            setName({ name: "" });
        }
    }

    return (
        <div className="container">
            <h1 className="display-1">Number Guessing Game</h1>
            <h2 className="h2">Enter your name to play</h2>
            <br/>
            <form onSubmit={onSubmit}>
                <div class="input-group mb-3">
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Name"
                      onChange={handleChange}              
                    />
                    <button className="btn btn-outline-primary" type="submit">Submit</button>
                </div>
            </form>
        </div>
    );
};
